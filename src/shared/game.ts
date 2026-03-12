import {
  type AgentSpecies,
  type AgentState,
  type AnimState,
  type BuildingKind,
  type BuildingState,
  type ChatMessage,
  type DecisionEngine,
  type Facing,
  type FocusGoal,
  type Point,
  type RenderMode,
  type ResourceKind,
  type ResourceNode,
  type SaveDraft,
  type SaveMeta,
  type ScriptParams,
  type ScriptProfile,
  type TokenUsageRecord,
  type WorldSave,
  focusGoalSchema,
  defaultAuthorityLimits,
  estimateTokenCount
} from './contracts'

const WORLD_VERSION = 1 as const
const CARRY_CAPACITY = 4
export const HARVEST_TICKS_REQUIRED = 6
export const BUILD_TICKS_REQUIRED = 14

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function roundedPoint(x: number, y: number): Point {
  return { x: Math.round(x), y: Math.round(y) }
}

function moveStepDiagonal(position: Point, target: Point, width: number, height: number): Point {
  if (samePoint(position, target)) return position
  const dx = target.x - position.x
  const dy = target.y - position.y
  return {
    x: clamp(position.x + Math.sign(dx), 0, width - 1),
    y: clamp(position.y + Math.sign(dy), 0, height - 1)
  }
}

function facingFromDelta(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx < 0) return 'west'
    if (dx > 0) return 'east'
  }
  if (dy < 0) return 'north'
  return 'south'
}

function animFromMovement(from: Point, to: Point): AnimState {
  return samePoint(from, to) ? 'idle' : 'walk'
}

function inferSpeciesColor(species: AgentSpecies): string {
  switch (species) {
    case 'lobster':
      return '#ef4444'
    case 'cat':
      return '#f59e0b'
    case 'dog':
      return '#60a5fa'
    case 'sheep':
      return '#f8fafc'
  }
}

function createAgent(name: string, species: AgentSpecies, role: 'admin' | 'npc', position: Point): AgentState {
  return {
    id: createId(role),
    name,
    species,
    role,
    scriptId: role === 'admin' ? 'admin-core' : 'settlement-worker',
    position,
    renderPosition: { x: position.x, y: position.y },
    inventory: { wood: 0, stone: 0 },
    currentTask: role === 'admin' ? '规划城镇' : '待命',
    actionTicks: 0,
    ageTicks: 0,
    maxAgeTicks: role === 'admin' ? 5200 : 4200 + Math.floor(Math.random() * 1500),
    mental: 78 + Math.floor(Math.random() * 18),
    mood: 'stable',
    facing: 'south',
    animState: 'idle',
    plan: role === 'admin' ? '建设住所、城镇、城市并管理居民' : '协助管理员完成建设和采集',
    focus: 'expand',
    memories: [],
    memorySummary: [],
    color: inferSpeciesColor(species)
  }
}

function createDefaultScriptProfile(ownerAgentId: string): ScriptProfile {
  return {
    id: 'admin-core',
    name: 'Admin Core Script',
    ownerAgentId,
    version: 1,
    updatedAt: Date.now(),
    params: {
      woodBias: 0.56,
      stoneBias: 0.44,
      expansionBias: 0.72,
      tidyBias: 0.28,
      spawnBias: 0.68
    }
  }
}

function addMemory(agent: AgentState, kind: AgentState['memories'][number]['kind'], content: string): void {
  agent.memories.push({
    id: createId('memory'),
    timestamp: Date.now(),
    kind,
    content
  })

  if (agent.memories.length > 12 && agent.memories.length % 6 === 0) {
    const block = agent.memories.slice(-6)
    agent.memorySummary.push(
      `${new Date(block[0].timestamp).toLocaleTimeString()}-${new Date(block[5].timestamp).toLocaleTimeString()} ${block
        .map((entry) => entry.content)
        .join('；')}`
    )
  }
}

function createSystemMessage(content: string): ChatMessage {
  return {
    id: createId('chat'),
    role: 'system',
    content,
    timestamp: Date.now()
  }
}

function createMeta(draft: SaveDraft, seed: number): SaveMeta {
  const now = Date.now()
  return {
    id: createId('world'),
    name: draft.name,
    species: draft.species,
    renderMode: draft.renderMode,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: now,
    seed,
    agentCount: 1,
    buildingCount: 0,
    tokenTotal: 0,
    lastHourTokens: 0,
    focus: 'expand',
    description: draft.renderMode === '3d' ? '一个体素风自治世界。' : '一个俯视角自治世界。'
  }
}

function clearTownArea(terrain: string[][], townCenter: Point): void {
  for (let y = townCenter.y - 6; y <= townCenter.y + 6; y += 1) {
    for (let x = townCenter.x - 8; x <= townCenter.x + 8; x += 1) {
      if (terrain[y]?.[x]) terrain[y][x] = 'grass'
    }
  }
}

function getNextBuilding(world: WorldSave['world']): { kind: BuildingKind; position: Point; wood: number; stone: number } | null {
  const count = (kind: BuildingKind) => world.buildings.filter((item) => item.kind === kind && item.complete).length
  const town = world.townCenter

  if (count('campfire') === 0) return { kind: 'campfire', position: { x: town.x, y: town.y }, wood: 4, stone: 0 }
  if (count('storage') === 0) return { kind: 'storage', position: { x: town.x + 3, y: town.y }, wood: 8, stone: 4 }
  if (count('hut') < 3) {
    const slot = count('hut')
    return { kind: 'hut', position: { x: town.x - 4 + slot * 4, y: town.y + 2 }, wood: 10, stone: 2 }
  }
  if (count('workshop') === 0) return { kind: 'workshop', position: { x: town.x, y: town.y + 4 }, wood: 14, stone: 8 }
  return null
}

function spendStockpile(world: WorldSave['world'], wood: number, stone: number): boolean {
  if (world.stockpile.wood < wood || world.stockpile.stone < stone) return false
  world.stockpile.wood -= wood
  world.stockpile.stone -= stone
  return true
}

function completeBuilding(world: WorldSave['world'], kind: BuildingKind, position: Point): BuildingState {
  const building: BuildingState = {
    id: createId('building'),
    kind,
    scriptId: 'settlement-structure',
    position,
    rotation: 0,
    progress: 1,
    complete: true
  }
  world.buildings.push(building)
  return building
}

function scoreTown(world: WorldSave['world']): number {
  const averageMental =
    world.agents.length === 0 ? 0 : world.agents.reduce((sum, agent) => sum + agent.mental, 0) / world.agents.length
  return (
    world.stockpile.wood * 1.1 +
    world.stockpile.stone * 1.0 +
    world.buildings.length * 22 +
    world.agents.length * 14 +
    averageMental * 1.4
  )
}

export function getBuildingFootprint(kind: BuildingKind): Point[] {
  if (kind === 'campfire') return []
  if (kind === 'storage') {
    return [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
      { x: 1, y: 1 }
    ]
  }
  if (kind === 'workshop') {
    return [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ]
  }
  return [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 }
  ]
}

export function getBuildingDoorway(kind: BuildingKind, position: Point): Point {
  if (kind === 'campfire') return position
  return { x: position.x, y: position.y + 1 }
}

export function isWalkableTile(
  world: WorldSave['world'],
  point: Point,
  options?: {
    ignoreAgents?: boolean
    ignoreResources?: boolean
    allowDoorway?: boolean
    ignorePoint?: Point
    allowResourceAtPoint?: Point
  }
): boolean {
  if (point.x < 0 || point.y < 0 || point.x >= world.width || point.y >= world.height) return false
  const terrain = world.terrain[point.y]?.[point.x]
  if (terrain === 'water') return false

  const townCollisionKeys = new Set<string>()
  const cx = world.townCenter.x
  const cy = world.townCenter.y
  ;[
    roundedPoint(cx - 2.6, cy - 1.8),
    roundedPoint(cx + 2.5, cy - 1.6),
    roundedPoint(cx + 0.9, cy + 2.2),
    roundedPoint(cx - 5.4, cy + 1.9),
    roundedPoint(cx + 5.1, cy - 2.2),
    roundedPoint(cx - 8.5, cy - 6.6),
    roundedPoint(cx - 8.4, cy + 6.4),
    roundedPoint(cx + 8.4, cy - 6.2),
    roundedPoint(cx + 8.2, cy + 6.4),
    roundedPoint(cx, cy - 7.2),
    roundedPoint(cx, cy + 7.1),
    roundedPoint(cx - 6.2, cy - 4.6),
    roundedPoint(cx - 4.8, cy - 4.6),
    roundedPoint(cx - 3.4, cy - 4.6),
    roundedPoint(cx + 3.4, cy - 4.6),
    roundedPoint(cx + 4.8, cy - 4.6),
    roundedPoint(cx + 6.2, cy - 4.6),
    roundedPoint(cx - 6.2, cy + 4.6),
    roundedPoint(cx - 4.8, cy + 4.6),
    roundedPoint(cx - 3.4, cy + 4.6),
    roundedPoint(cx + 3.4, cy + 4.6),
    roundedPoint(cx + 4.8, cy + 4.6),
    roundedPoint(cx + 6.2, cy + 4.6),
    roundedPoint(cx - 7, cy - 3.2),
    roundedPoint(cx - 7, cy - 1.8),
    roundedPoint(cx - 7, cy - 0.4),
    roundedPoint(cx - 7, cy + 1),
    roundedPoint(cx - 7, cy + 2.4),
    roundedPoint(cx - 7, cy + 3.8),
    roundedPoint(cx + 7, cy - 3.2),
    roundedPoint(cx + 7, cy - 1.8),
    roundedPoint(cx + 7, cy - 0.4),
    roundedPoint(cx + 7, cy + 1),
    roundedPoint(cx + 7, cy + 2.4),
    roundedPoint(cx + 7, cy + 3.8)
  ].forEach((blocker) => {
    if (!samePoint(blocker, world.townCenter)) {
      townCollisionKeys.add(`${blocker.x},${blocker.y}`)
    }
  })

  const blocksBuilding = world.buildings.some((building) => {
    if (!building.complete) return false
    const doorway = getBuildingDoorway(building.kind, building.position)
    if (options?.allowDoorway && samePoint(doorway, point)) return false
    return getBuildingFootprint(building.kind).some(
      (offset) => building.position.x + offset.x === point.x && building.position.y + offset.y === point.y
    )
  })
  if (blocksBuilding) return false

  if (!options?.ignoreResources) {
    const hasResource = world.resources.some(
      (resource) =>
        resource.amount > 0 &&
        samePoint(resource.position, point) &&
        (!options?.allowResourceAtPoint || !samePoint(resource.position, options.allowResourceAtPoint))
    )
    if (hasResource) return false
  }

  if (townCollisionKeys.has(`${point.x},${point.y}`)) return false

  if (!options?.ignoreAgents) {
    const occupied = world.agents.some(
      (agent) =>
        (!options?.ignorePoint || !samePoint(agent.position, options.ignorePoint)) &&
        samePoint(agent.position, point)
    )
    if (occupied) return false
  }

  return true
}

export function findPath(
  world: WorldSave['world'],
  start: Point,
  target: Point,
  options?: {
    maxNodes?: number
    ignoreAgents?: boolean
    allowResourceAtPoint?: Point
  }
): Point[] | null {
  if (samePoint(start, target)) return []
  if (
    !isWalkableTile(world, target, {
      allowDoorway: true,
      ignoreAgents: options?.ignoreAgents ?? true,
      allowResourceAtPoint: options?.allowResourceAtPoint
    })
  ) {
    return null
  }

  const queue: Point[] = [start]
  const seen = new Set([`${start.x},${start.y}`])
  const parent = new Map<string, Point>()
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ]
  let expanded = 0
  const maxNodes = options?.maxNodes ?? 512

  while (queue.length > 0 && expanded < maxNodes) {
    const current = queue.shift()!
    expanded += 1
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      const key = `${next.x},${next.y}`
      if (seen.has(key)) continue
      if (
        !isWalkableTile(world, next, {
          allowDoorway: true,
          ignoreAgents: options?.ignoreAgents ?? true,
          ignorePoint: start,
          allowResourceAtPoint: options?.allowResourceAtPoint
        })
      ) {
        continue
      }
      seen.add(key)
      parent.set(key, current)
      if (samePoint(next, target)) {
        const path: Point[] = [next]
        let cursor = current
        while (!samePoint(cursor, start)) {
          path.unshift(cursor)
          cursor = parent.get(`${cursor.x},${cursor.y}`)!
        }
        return path
      }
      queue.push(next)
    }
  }

  return null
}

function stepTowardTarget(
  world: WorldSave['world'],
  start: Point,
  target: Point,
  options?: {
    allowResourceAtPoint?: Point
  }
): Point {
  const path = findPath(world, start, target, {
    ignoreAgents: true,
    allowResourceAtPoint: options?.allowResourceAtPoint,
    maxNodes: 768
  })
  if (path && path.length > 0) {
    return path[0]!
  }
  return tryStepToward(world, start, target)
}

export function tryStepToward(world: WorldSave['world'], start: Point, target: Point): Point {
  if (samePoint(start, target)) return start
  const dx = Math.sign(target.x - start.x)
  const dy = Math.sign(target.y - start.y)
  const candidates: Point[] = [
    { x: start.x + dx, y: start.y + dy },
    { x: start.x + dx, y: start.y },
    { x: start.x, y: start.y + dy },
    { x: start.x + dx, y: start.y - dy },
    { x: start.x - dx, y: start.y + dy }
  ].filter((candidate, index, all) => !(candidate.x === start.x && candidate.y === start.y) && all.findIndex((item) => samePoint(item, candidate)) === index)

  for (const candidate of candidates) {
    if (isWalkableTile(world, candidate, { allowDoorway: true, ignorePoint: start, allowResourceAtPoint: target })) {
      return candidate
    }
  }

  return start
}

function findNearestResource(world: WorldSave['world'], origin: Point, kind: ResourceKind): ResourceNode | null {
  const candidates = world.resources.filter((resource) => resource.kind === kind && resource.amount > 0)
  if (candidates.length === 0) return null
  return candidates.reduce((best, current) => (manhattan(origin, current.position) < manhattan(origin, best.position) ? current : best))
}

function getResourceWorkPosition(world: WorldSave['world'], origin: Point, resource: ResourceNode): Point | null {
  const candidates: Point[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      candidates.push({ x: resource.position.x + dx, y: resource.position.y + dy })
    }
  }

  let bestPoint: Point | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (!isWalkableTile(world, candidate, { allowDoorway: true, ignoreAgents: true })) continue
    const path = findPath(world, origin, candidate, { ignoreAgents: true, maxNodes: 768 })
    if (!path) continue
    const score = path.length * 100 + manhattan(origin, candidate)
    if (score < bestScore) {
      bestScore = score
      bestPoint = candidate
    }
  }

  return bestPoint
}

function findReachableResource(world: WorldSave['world'], origin: Point, kind: ResourceKind): { resource: ResourceNode; workPosition: Point } | null {
  const candidates = world.resources
    .filter((resource) => resource.kind === kind && resource.amount > 0)
    .sort((a, b) => manhattan(origin, a.position) - manhattan(origin, b.position))
    .slice(0, 10)

  for (const resource of candidates) {
    const workPosition = getResourceWorkPosition(world, origin, resource)
    if (workPosition) {
      return { resource, workPosition }
    }
  }

  const fallback = findNearestResource(world, origin, kind)
  if (!fallback) return null
  const fallbackWorkPosition = getResourceWorkPosition(world, origin, fallback)
  if (!fallbackWorkPosition) return null
  return { resource: fallback, workPosition: fallbackWorkPosition }
}

function maybeSpawnNpc(save: WorldSave, admin: AgentState): boolean {
  if (save.world.agents.length >= save.world.authority.maxAgents) return false
  if (!spendStockpile(save.world, 8, 2)) return false
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  const speciesCycle: AgentSpecies[] = ['cat', 'dog', 'sheep', 'lobster']
  const npc = createAgent(`Settler ${npcCount + 2}`, speciesCycle[npcCount % speciesCycle.length], 'npc', {
    x: save.world.townCenter.x + ((npcCount % 3) - 1) * 2,
    y: save.world.townCenter.y + 2 + (npcCount % 2)
  })
  npc.focus = save.world.focus
  addMemory(npc, 'observation', '我在新定居点诞生，准备为城镇效力。')
  save.world.agents.push(npc)
  addMemory(admin, 'action', `我接纳了新居民 ${npc.name}。`)
  save.world.chatLog.push(createSystemMessage(`新居民 ${npc.name} 诞生，准备加入聚落建设。`))
  return true
}

function applyLifeCycle(save: WorldSave): void {
  const dead: AgentState[] = []

  for (const agent of save.world.agents) {
    const wasEmo = agent.mood === 'emo'
    agent.ageTicks += 1
    if (save.world.time % 24 === 0) {
      const stress = save.world.agents.length > save.world.authority.maxAgents * 0.8 ? 1.8 : 0.4
      const resilience = agent.role === 'admin' ? 0.2 : 0.5
      agent.mental = clamp(agent.mental - stress + resilience, 0, 100)
    }
    if (save.world.time % 72 === 0 && Math.random() < 0.06) {
      agent.mental = clamp(agent.mental - 4, 0, 100)
    }
    if (save.world.time % 28 === 0) {
      const atTown = samePoint(agent.position, save.world.townCenter)
      const recovery = atTown ? 3.2 : agent.currentTask === '巡逻' ? 2.2 : 1.8
      agent.mental = clamp(agent.mental + recovery, 0, 100)
    }
    agent.mood = agent.mental < 22 ? 'emo' : 'stable'
    if (!wasEmo && agent.mood === 'emo') {
      addMemory(agent, 'observation', '我感到低落，情绪开始波动。')
      save.world.chatLog.push(createSystemMessage(`居民 ${agent.name} 陷入低落情绪，工作节奏暂时放缓。`))
    } else if (wasEmo && agent.mood === 'stable') {
      addMemory(agent, 'summary', '我缓过来了，可以继续专注干活。')
      save.world.chatLog.push(createSystemMessage(`居民 ${agent.name} 振作起来，重新回到稳定状态。`))
    }

    const memoryLoad = agent.memories.length + agent.memorySummary.length
    if (memoryLoad >= save.world.authority.maxMemoriesPerAgent || agent.ageTicks >= agent.maxAgeTicks) {
      dead.push(agent)
    }
  }

  if (dead.length === 0) return
  const deadIds = new Set(dead.map((agent) => agent.id))
  const adminDead = dead.some((agent) => agent.role === 'admin')
  save.world.agents = save.world.agents.filter((agent) => !deadIds.has(agent.id))
  for (const agent of dead) {
    save.world.chatLog.push(
      createSystemMessage(
        `居民 ${agent.name} 逝去：${agent.memories.length + agent.memorySummary.length >= save.world.authority.maxMemoriesPerAgent ? '记忆达到上限' : '自然老去'}。`
      )
    )
  }

  if (adminDead && save.world.agents.length > 0) {
    const successor =
      save.world.agents
        .filter((agent) => agent.role === 'npc')
        .sort((a, b) => b.mental - a.mental || b.ageTicks - a.ageTicks)[0] ?? save.world.agents[0]
    successor.role = 'admin'
    successor.scriptId = 'admin-core'
    successor.currentTask = '接管管理'
    successor.plan = '接受 Authority 授权并与 God 对话，继续建设城镇。'
    addMemory(successor, 'summary', 'Authority 已授权我成为新任 Admin。')
    save.world.chatLog.push(createSystemMessage(`Authority 任命 ${successor.name} 成为新任 Admin。`))
  }
}

function depositAtTown(world: WorldSave['world'], agent: AgentState): boolean {
  if (!samePoint(agent.position, world.townCenter)) return false
  if (agent.inventory.wood === 0 && agent.inventory.stone === 0) return false
  world.stockpile.wood += agent.inventory.wood
  world.stockpile.stone += agent.inventory.stone
  agent.inventory.wood = 0
  agent.inventory.stone = 0
  agent.actionTicks = 0
  agent.animState = 'idle'
  addMemory(agent, 'action', '我把资源送回了城镇。')
  return true
}

function maybeHarvest(world: WorldSave['world'], agent: AgentState, resource: ResourceNode): boolean {
  if (chebyshev(agent.position, resource.position) > 1) return false
  if (resource.amount <= 0) return false
  const carry = agent.inventory.wood + agent.inventory.stone
  if (carry >= CARRY_CAPACITY) return false
  const speedPenalty = agent.mood === 'emo' ? 1 : 0
  agent.actionTicks += 1
  if (agent.actionTicks < HARVEST_TICKS_REQUIRED + speedPenalty) return false
  agent.actionTicks = 0
  resource.amount -= 1
  if (resource.kind === 'tree') agent.inventory.wood += 1
  else agent.inventory.stone += 1
  addMemory(agent, 'action', resource.kind === 'tree' ? '我砍下一单位木材。' : '我采集了一单位石头。')
  return true
}

function directNpcFocus(world: WorldSave['world'], npcIndex: number): ResourceKind {
  if (world.focus === 'wood') return 'tree'
  if (world.focus === 'stone') return 'stone'
  return npcIndex % 2 === 0 ? 'tree' : 'stone'
}

function advanceAdmin(save: WorldSave, admin: AgentState): void {
  const desiredAction = save.world.llmPolicy.nextAdminAction
  const nextBuilding = getNextBuilding(save.world)

  if (depositAtTown(save.world, admin)) return
  if (admin.inventory.wood + admin.inventory.stone > 0) {
    admin.currentTask = '回城'
    admin.actionTicks = 0
    const moved = stepTowardTarget(save.world, admin.position, save.world.townCenter)
    admin.facing = facingFromDelta(moved.x - admin.position.x, moved.y - admin.position.y)
    admin.animState = animFromMovement(admin.position, moved)
    admin.position = moved
    return
  }

  if (nextBuilding && desiredAction === 'build' && save.world.buildings.length < save.world.authority.maxBuildings) {
    if (save.world.stockpile.wood >= nextBuilding.wood && save.world.stockpile.stone >= nextBuilding.stone) {
      admin.currentTask = '建造'
      const moved = stepTowardTarget(save.world, admin.position, nextBuilding.position)
      admin.facing = facingFromDelta(moved.x - admin.position.x, moved.y - admin.position.y)
      admin.animState = animFromMovement(admin.position, moved)
      admin.position = moved
      admin.actionTicks = samePoint(admin.position, nextBuilding.position) ? admin.actionTicks + 1 : 0
      if (admin.actionTicks >= BUILD_TICKS_REQUIRED && spendStockpile(save.world, nextBuilding.wood, nextBuilding.stone)) {
        admin.actionTicks = 0
        completeBuilding(save.world, nextBuilding.kind, nextBuilding.position)
        addMemory(admin, 'action', `我完成了 ${nextBuilding.kind} 的建设。`)
      }
      return
    }
  }

  if (desiredAction === 'spawn' && save.world.agents.length < save.world.authority.maxAgents) {
    admin.currentTask = '扩编居民'
    if (samePoint(admin.position, save.world.townCenter)) {
      admin.animState = 'idle'
      maybeSpawnNpc(save, admin)
    } else {
      const moved = stepTowardTarget(save.world, admin.position, save.world.townCenter)
      admin.facing = facingFromDelta(moved.x - admin.position.x, moved.y - admin.position.y)
      admin.animState = animFromMovement(admin.position, moved)
      admin.position = moved
    }
    return
  }

  const targetKind: ResourceKind = desiredAction === 'gatherStone' ? 'stone' : 'tree'
  const resourceTarget = findReachableResource(save.world, admin.position, targetKind)
  if (!resourceTarget) {
    admin.currentTask = '巡逻'
    const moved = stepTowardTarget(save.world, admin.position, save.world.townCenter)
    admin.facing = facingFromDelta(moved.x - admin.position.x, moved.y - admin.position.y)
    admin.animState = animFromMovement(admin.position, moved)
    admin.position = moved
    return
  }
  admin.currentTask = targetKind === 'tree' ? '砍树' : '采石'
  const { resource, workPosition } = resourceTarget
  const moved = stepTowardTarget(save.world, admin.position, workPosition)
  admin.facing = facingFromDelta(moved.x - admin.position.x, moved.y - admin.position.y)
  admin.animState = animFromMovement(admin.position, moved)
  admin.position = moved
  if (chebyshev(admin.position, resource.position) <= 1) {
    admin.facing = facingFromDelta(resource.position.x - admin.position.x, resource.position.y - admin.position.y)
    admin.animState = 'walk'
  }
  maybeHarvest(save.world, admin, resource)
}

function advanceNpc(save: WorldSave, agent: AgentState, index: number): void {
  if (depositAtTown(save.world, agent)) return
  if (agent.inventory.wood + agent.inventory.stone > 0) {
    agent.currentTask = '回城'
    agent.actionTicks = 0
    const moved = stepTowardTarget(save.world, agent.position, save.world.townCenter)
    agent.facing = facingFromDelta(moved.x - agent.position.x, moved.y - agent.position.y)
    agent.animState = animFromMovement(agent.position, moved)
    agent.position = moved
    return
  }
  const targetKind = directNpcFocus(save.world, index)
  const resourceTarget = findReachableResource(save.world, agent.position, targetKind)
  if (!resourceTarget) {
    agent.currentTask = '巡逻'
    const moved = stepTowardTarget(save.world, agent.position, save.world.townCenter)
    agent.facing = facingFromDelta(moved.x - agent.position.x, moved.y - agent.position.y)
    agent.animState = animFromMovement(agent.position, moved)
    agent.position = moved
    return
  }
  agent.currentTask = targetKind === 'tree' ? '砍树' : '采石'
  const { resource, workPosition } = resourceTarget
  const moved = stepTowardTarget(save.world, agent.position, workPosition)
  agent.facing = facingFromDelta(moved.x - agent.position.x, moved.y - agent.position.y)
  agent.animState = animFromMovement(agent.position, moved)
  agent.position = moved
  if (chebyshev(agent.position, resource.position) <= 1) {
    agent.facing = facingFromDelta(resource.position.x - agent.position.x, resource.position.y - agent.position.y)
    agent.animState = 'walk'
  }
  maybeHarvest(save.world, agent, resource)
}

function cleanupResources(world: WorldSave['world']): void {
  world.resources = world.resources.filter((resource) => resource.amount > 0)
}

export function createNewWorldSave(draft: SaveDraft): WorldSave {
  const seed = draft.seed ?? Math.floor(Math.random() * 100_000)
  const random = mulberry32(seed)
  const width = defaultAuthorityLimits.mapWidth
  const height = defaultAuthorityLimits.mapHeight
  const terrain = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const noise = (Math.sin((x + seed) * 0.19) + Math.cos((y - seed) * 0.12) + random() * 0.8) / 2.8 + 0.5
      if (noise < 0.2) return 'water'
      if (noise < 0.33) return 'forest'
      if (noise > 0.82) return 'stone'
      if (noise > 0.65) return 'soil'
      return 'grass'
    })
  )

  const townCenter = { x: Math.floor(width / 2), y: Math.floor(height / 2) }
  clearTownArea(terrain, townCenter)
  const resources: ResourceNode[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = terrain[y][x]
      if (tile === 'forest' && random() > 0.44) {
        resources.push({ id: createId('tree'), kind: 'tree', scriptId: 'resource-node', position: { x, y }, amount: 3 + Math.floor(random() * 5) })
      }
      if (tile === 'stone' && random() > 0.48) {
        resources.push({ id: createId('stone'), kind: 'stone', scriptId: 'resource-node', position: { x, y }, amount: 3 + Math.floor(random() * 5) })
      }
    }
  }

  const meta = createMeta(draft, seed)
  const admin = createAgent('Admin', draft.species, 'admin', townCenter)
  const starterNpc = createAgent('Settler 1', 'cat', 'npc', { x: townCenter.x + 1, y: townCenter.y + 1 })
  const starterBuildings: BuildingState[] = [
    {
      id: createId('building'),
      kind: 'campfire',
      scriptId: 'settlement-structure',
      position: { x: townCenter.x, y: townCenter.y },
      rotation: 0,
      progress: 1,
      complete: true
    }
  ]
  meta.agentCount = 2
  meta.buildingCount = starterBuildings.length

  return {
    version: WORLD_VERSION,
    meta,
    settings: {
      focus: 'expand',
      renderMode: draft.renderMode,
      decisionEngine: draft.decisionEngine,
      playerControlMode: 'control'
    },
    world: {
      width,
      height,
      seed,
      time: 0,
      focus: 'expand',
      townCenter,
      player: {
        name: 'God Avatar',
        position: { x: townCenter.x + 1, y: townCenter.y + 1 },
        renderPosition: { x: townCenter.x + 1, y: townCenter.y + 1 },
        facing: 'south',
        animState: 'idle'
      },
      stockpile: { wood: 6, stone: 2 },
      terrain,
      resources,
      buildings: starterBuildings,
      agents: [admin, starterNpc],
      chatLog: [createSystemMessage('Authority 已生成首个 Admin Agent。世界建设开始。')],
      tokenLedger: [],
      llmPolicy: {
        nextAdminAction: 'gatherWood',
        rationale: '等待 MiniMax LLM 首次行为规划。',
        source: 'fallback',
        updatedAt: 0
      },
      scriptProfiles: [createDefaultScriptProfile(admin.id)],
      scriptEvents: [
        {
          id: createId('script-event'),
          scriptId: 'admin-core',
          actorId: admin.id,
          timestamp: Date.now(),
          status: 'approved',
          summary: 'Authority 绑定 MiniMax LLM 行为规划并授权 Admin 建设世界。'
        }
      ],
      authority: { ...defaultAuthorityLimits }
    }
  }
}

export function tickWorld(save: WorldSave): WorldSave {
  const clone = structuredClone(save) as WorldSave
  clone.world.time += 1

  const heavyLoad = clone.world.agents.length > 48
  clone.world.agents.forEach((agent, index) => {
    agent.focus = clone.world.focus
    if (agent.role === 'npc' && heavyLoad && (clone.world.time + index) % 2 !== 0) return
    if (agent.role === 'admin') advanceAdmin(clone, agent)
    else advanceNpc(clone, agent, index)
  })

  cleanupResources(clone.world)
  applyLifeCycle(clone)
  clone.meta.updatedAt = Date.now()
  clone.meta.lastPlayedAt = Date.now()
  clone.meta.agentCount = clone.world.agents.length
  clone.meta.buildingCount = clone.world.buildings.length
  return clone
}

export function getWorldSummary(save: WorldSave): string {
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  const emoCount = save.world.agents.filter((agent) => agent.mood === 'emo').length
  return [
    `世界 ${save.meta.name}`,
    `时间刻 ${save.world.time}`,
    `焦点 ${save.world.focus}`,
    `渲染 ${save.settings.renderMode}`,
    `决策 ${save.settings.decisionEngine}`,
    `库存 木材${save.world.stockpile.wood} 石头${save.world.stockpile.stone}`,
    `建筑 ${save.world.buildings.length}`,
    `代理 ${save.world.agents.length}（NPC ${npcCount}，EMO ${emoCount}）`,
    `资源点 ${save.world.resources.length}`
  ].join(' | ')
}

export function parseFocusFromMessage(message: string, current: FocusGoal): FocusGoal {
  const text = message.toLowerCase()
  if (/(木|tree|wood|伐木)/.test(text)) return 'wood'
  if (/(石|stone|矿)/.test(text)) return 'stone'
  if (/(整理|tidy|修整|收拾)/.test(text)) return 'tidy'
  if (/(扩张|扩建|发展|expand|town|城镇)/.test(text)) return 'expand'
  if (/(平衡|balanced|综合)/.test(text)) return 'balanced'
  return current
}

export function evaluateAuthority(message: string, save: WorldSave): { accepted: boolean; reason?: string } {
  const text = message.toLowerCase()
  const numericMatches = [...message.matchAll(/\d+/g)].map((item) => Number(item[0]))
  const requestedCount = numericMatches.length > 0 ? Math.max(...numericMatches) : 0
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  if (requestedCount >= 100 || /(1000|无限|infinite|爆炸|crash|崩溃|rm -rf|删除系统)/.test(text)) {
    return { accepted: false, reason: 'Authority 拒绝危险请求：该命令会突破稳定性边界。' }
  }
  if (/(agent|npc|小 agent|小agent)/.test(text) && requestedCount > save.world.authority.maxAgents - npcCount) {
    return { accepted: false, reason: `Authority 拒绝扩员请求：当前世界最多支持 ${save.world.authority.maxAgents} 个活跃 Agent。` }
  }
  return { accepted: true }
}

export function appendChat(save: WorldSave, role: ChatMessage['role'], content: string): WorldSave {
  const clone = structuredClone(save) as WorldSave
  clone.world.chatLog.push({ id: createId('chat'), role, content, timestamp: Date.now() })
  return clone
}

export function applyFocus(save: WorldSave, focus: FocusGoal): WorldSave {
  const clone = structuredClone(save) as WorldSave
  if (clone.settings.focus === focus && clone.world.focus === focus) {
    return clone
  }
  clone.settings.focus = focus
  clone.world.focus = focus
  clone.world.agents.forEach((agent) => {
    agent.focus = focus
  })
  const admin = clone.world.agents.find((agent) => agent.role === 'admin')
  const adminScript = clone.world.scriptProfiles.find((profile) => profile.id === admin?.scriptId)
  if (admin && adminScript) {
    const tunedParams: Record<FocusGoal, ScriptParams> = {
      balanced: { woodBias: 0.5, stoneBias: 0.5, expansionBias: 0.6, tidyBias: 0.35, spawnBias: 0.55 },
      expand: { woodBias: 0.58, stoneBias: 0.42, expansionBias: 0.8, tidyBias: 0.2, spawnBias: 0.75 },
      wood: { woodBias: 0.85, stoneBias: 0.15, expansionBias: 0.58, tidyBias: 0.2, spawnBias: 0.6 },
      stone: { woodBias: 0.2, stoneBias: 0.8, expansionBias: 0.55, tidyBias: 0.25, spawnBias: 0.52 },
      tidy: { woodBias: 0.45, stoneBias: 0.55, expansionBias: 0.25, tidyBias: 0.9, spawnBias: 0.2 }
    }
    adminScript.version += 1
    adminScript.updatedAt = Date.now()
    adminScript.params = tunedParams[focus]
    clone.world.scriptEvents.push({
      id: createId('script-event'),
      scriptId: adminScript.id,
      actorId: admin.id,
      timestamp: Date.now(),
      status: 'approved',
      summary: `Authority 批准 Admin 将脚本调优为 ${focus} 模式，版本提升至 v${adminScript.version}。`
    })
  }
  return clone
}

export function addTokenUsage(save: WorldSave, usage: TokenUsageRecord): WorldSave {
  const clone = structuredClone(save) as WorldSave
  clone.world.tokenLedger.push(usage)
  return clone
}

export function createEstimatedUsage(
  provider: string,
  worldId: string,
  agentId: string,
  requestType: TokenUsageRecord['requestType'],
  model: string,
  prompt: string,
  completion: string
): TokenUsageRecord {
  const promptTokens = estimateTokenCount(prompt)
  const completionTokens = estimateTokenCount(completion)
  return {
    id: createId('usage'),
    timestamp: Date.now(),
    provider,
    worldId,
    agentId,
    requestType,
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true
  }
}

export type TokenSummary = {
  totalTokens: number
  byProvider: Record<string, number>
  byAgent: Record<string, number>
  lastHour: number
  byType: Record<string, number>
}

export function summarizeTokenUsage(records: TokenUsageRecord[], now = Date.now()): TokenSummary {
  return records.reduce<TokenSummary>(
    (summary, record) => {
      summary.totalTokens += record.totalTokens
      summary.byProvider[record.provider] = (summary.byProvider[record.provider] ?? 0) + record.totalTokens
      summary.byAgent[record.agentId] = (summary.byAgent[record.agentId] ?? 0) + record.totalTokens
      summary.byType[record.requestType] = (summary.byType[record.requestType] ?? 0) + record.totalTokens
      if (record.timestamp >= now - 60 * 60 * 1000) summary.lastHour += record.totalTokens
      return summary
    },
    { totalTokens: 0, byProvider: {}, byAgent: {}, byType: {}, lastHour: 0 }
  )
}

export function summarizeTokenTrend(records: TokenUsageRecord[], bucketMinutes = 10, bucketCount = 6, now = Date.now()) {
  const bucketSize = bucketMinutes * 60 * 1000
  return Array.from({ length: bucketCount }, (_item, index) => {
    const bucketStart = now - bucketSize * (bucketCount - index)
    const bucketEnd = bucketStart + bucketSize
    const total = records
      .filter((record) => record.timestamp >= bucketStart && record.timestamp < bucketEnd)
      .reduce((sum, record) => sum + record.totalTokens, 0)
    return { label: `${new Date(bucketStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, total }
  })
}

export function deriveSaveMeta(save: WorldSave, now = Date.now()): SaveMeta {
  const tokenSummary = summarizeTokenUsage(save.world.tokenLedger, now)
  return {
    ...save.meta,
    renderMode: save.settings.renderMode,
    updatedAt: now,
    lastPlayedAt: now,
    agentCount: save.world.agents.length,
    buildingCount: save.world.buildings.length,
    tokenTotal: tokenSummary.totalTokens,
    lastHourTokens: tokenSummary.lastHour,
    focus: save.world.focus
  }
}

export function migrateWorldSave(raw: unknown): WorldSave {
  const candidate = raw as Partial<WorldSave> & {
    meta?: Partial<SaveMeta>
    settings?: Partial<WorldSave['settings']>
    world?: Partial<WorldSave['world']>
  }
  const focus = focusGoalSchema.safeParse(candidate.world?.focus ?? candidate.settings?.focus ?? candidate.meta?.focus).success
    ? focusGoalSchema.parse(candidate.world?.focus ?? candidate.settings?.focus ?? candidate.meta?.focus)
    : 'expand'

  const renderMode: RenderMode = candidate.settings?.renderMode === '2d' ? '2d' : '3d'
  const legacyDecisionEngine = candidate.settings?.decisionEngine as string | undefined
  const decisionEngine: DecisionEngine = legacyDecisionEngine === 'general-llm' || legacyDecisionEngine === 'ai' ? 'general-llm' : 'minimax-llm'

  const normalized = {
    version: 1,
    ...candidate,
    meta: {
      id: candidate.meta?.id ?? createId('world'),
      name: candidate.meta?.name ?? 'Recovered World',
      species: candidate.meta?.species ?? 'lobster',
      renderMode,
      createdAt: candidate.meta?.createdAt ?? Date.now(),
      updatedAt: candidate.meta?.updatedAt ?? Date.now(),
      lastPlayedAt: candidate.meta?.lastPlayedAt ?? candidate.meta?.updatedAt ?? Date.now(),
      seed: candidate.meta?.seed ?? candidate.world?.seed ?? 0,
      agentCount: candidate.meta?.agentCount ?? candidate.world?.agents?.length ?? 1,
      buildingCount: candidate.meta?.buildingCount ?? candidate.world?.buildings?.length ?? 0,
      tokenTotal: candidate.meta?.tokenTotal ?? 0,
      lastHourTokens: candidate.meta?.lastHourTokens ?? 0,
      focus,
      description: candidate.meta?.description ?? '由迁移器恢复的自治世界。'
    },
    settings: {
      focus,
      renderMode,
      decisionEngine,
      playerControlMode: candidate.settings?.playerControlMode === 'observe' ? 'observe' : 'control'
    },
    world: {
      width: candidate.world?.width ?? defaultAuthorityLimits.mapWidth,
      height: candidate.world?.height ?? defaultAuthorityLimits.mapHeight,
      seed: candidate.world?.seed ?? candidate.meta?.seed ?? 0,
      time: candidate.world?.time ?? 0,
      focus,
      townCenter: candidate.world?.townCenter ?? { x: 32, y: 32 },
      player: candidate.world?.player ?? { name: 'God Avatar', position: { x: 33, y: 33 } },
      stockpile: candidate.world?.stockpile ?? { wood: 0, stone: 0 },
      terrain: candidate.world?.terrain ?? [],
      resources: candidate.world?.resources ?? [],
      buildings: candidate.world?.buildings ?? [],
      agents: candidate.world?.agents ?? [],
      chatLog: candidate.world?.chatLog ?? [],
      tokenLedger: candidate.world?.tokenLedger ?? [],
      llmPolicy: candidate.world?.llmPolicy ?? {
        nextAdminAction: 'gatherWood',
        rationale: '迁移后等待 MiniMax LLM 首次规划。',
        source: 'fallback',
        updatedAt: 0
      },
      scriptProfiles:
        candidate.world?.scriptProfiles && candidate.world.scriptProfiles.length > 0
          ? candidate.world.scriptProfiles
          : candidate.world?.agents?.[0]
            ? [createDefaultScriptProfile(candidate.world.agents[0].id)]
            : [],
      scriptEvents: candidate.world?.scriptEvents ?? [],
      authority: { ...defaultAuthorityLimits, ...candidate.world?.authority }
    }
  }

  const parsed = normalized as WorldSave
  parsed.world.resources = parsed.world.resources.map((resource) => ({ ...resource, scriptId: resource.scriptId ?? 'resource-node' }))
  parsed.world.buildings = parsed.world.buildings.map((building) => ({ ...building, scriptId: building.scriptId ?? 'settlement-structure' }))
  parsed.world.agents = parsed.world.agents.map((agent) => ({
    ...agent,
    actionTicks: agent.actionTicks ?? 0,
    ageTicks: agent.ageTicks ?? 0,
    maxAgeTicks: agent.maxAgeTicks ?? 4200,
    mental: agent.mental ?? 70,
    mood: agent.mood ?? 'stable',
    facing: agent.facing ?? 'south',
    animState: agent.animState ?? 'idle',
    renderPosition: agent.renderPosition ?? { x: agent.position.x, y: agent.position.y },
    scriptId: agent.scriptId ?? (agent.role === 'admin' ? 'admin-core' : 'settlement-worker')
  }))
  parsed.world.buildings = parsed.world.buildings.map((building) => ({
    ...building,
    rotation: building.rotation ?? 0
  }))
  parsed.world.player = {
    ...parsed.world.player,
    renderPosition: parsed.world.player.renderPosition ?? { x: parsed.world.player.position.x, y: parsed.world.player.position.y },
    facing: parsed.world.player.facing ?? 'south',
    animState: parsed.world.player.animState ?? 'idle'
  }
  return { ...parsed, meta: deriveSaveMeta(parsed, parsed.meta.updatedAt || Date.now()) }
}

export function getAuthoritySnapshot(save: WorldSave) {
  const agentLoad = save.world.agents.length / save.world.authority.maxAgents
  const buildingLoad = save.world.buildings.length / save.world.authority.maxBuildings
  const memoryCapacity = save.world.authority.maxMemoriesPerAgent * Math.max(save.world.agents.length, 1)
  const memoryUsage = save.world.agents.reduce((sum, agent) => sum + agent.memories.length + agent.memorySummary.length, 0)
  const memoryLoad = memoryUsage / memoryCapacity
  return { agentLoad, buildingLoad, memoryLoad, memoryUsage, memoryCapacity, score: scoreTown(save.world) }
}
