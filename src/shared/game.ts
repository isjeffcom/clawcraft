import {
  type AgentSpecies,
  type AgentState,
  type AuthorityLimits,
  type BuildingKind,
  type BuildingState,
  type ChatMessage,
  type FocusGoal,
  type Point,
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

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function moveStep(position: Point, target: Point, width: number, height: number): Point {
  if (samePoint(position, target)) return position

  const dx = target.x - position.x
  const dy = target.y - position.y

  const next =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: position.x + Math.sign(dx), y: position.y }
      : { x: position.x, y: position.y + Math.sign(dy) }

  return {
    x: clamp(next.x, 0, width - 1),
    y: clamp(next.y, 0, height - 1)
  }
}

function clearTownArea(terrain: string[][], townCenter: Point): void {
  for (let y = townCenter.y - 3; y <= townCenter.y + 3; y += 1) {
    for (let x = townCenter.x - 3; x <= townCenter.x + 3; x += 1) {
      if (terrain[y]?.[x]) {
        terrain[y][x] = 'grass'
      }
    }
  }
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
    inventory: {
      wood: 0,
      stone: 0
    },
    currentTask: role === 'admin' ? '观察荒野并筹建城镇' : '等待管理员派工',
    plan: role === 'admin' ? '建设城镇并派生更多小 Agent' : '协助管理员收集与建设',
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
      woodBias: 0.55,
      stoneBias: 0.45,
      expansionBias: 0.7,
      tidyBias: 0.2,
      spawnBias: 0.68
    }
  }
}

function addMemory(agent: AgentState, limits: AuthorityLimits, kind: AgentState['memories'][number]['kind'], content: string): void {
  agent.memories.push({
    id: createId('memory'),
    timestamp: Date.now(),
    kind,
    content
  })

  if (agent.memories.length > limits.maxMemoriesPerAgent) {
    const compressed = agent.memories.splice(0, 6)
    agent.memorySummary.push(
      `${new Date(compressed[0].timestamp).toLocaleTimeString()} - ${new Date(
        compressed[compressed.length - 1].timestamp
      ).toLocaleTimeString()}：${compressed.map((entry) => entry.content).join('；')}`
    )
    agent.memories.unshift({
      id: createId('memory'),
      timestamp: Date.now(),
      kind: 'summary',
      content: `Authority 压缩了 ${compressed.length} 条旧记忆。`
    })
  }
}

function getNextBuilding(world: WorldSave['world']): { kind: BuildingKind; position: Point; wood: number; stone: number } | null {
  const count = (kind: BuildingKind) => world.buildings.filter((item) => item.kind === kind && item.complete).length
  const town = world.townCenter

  if (count('campfire') === 0) {
    return { kind: 'campfire', position: { x: town.x, y: town.y }, wood: 6, stone: 0 }
  }

  if (count('storage') === 0) {
    return { kind: 'storage', position: { x: town.x + 2, y: town.y }, wood: 8, stone: 4 }
  }

  if (world.focus === 'tidy' && count('workshop') === 0) {
    return { kind: 'workshop', position: { x: town.x, y: town.y + 3 }, wood: 14, stone: 8 }
  }

  if (count('hut') < 2) {
    return {
      kind: 'hut',
      position: { x: town.x + (count('hut') === 0 ? -2 : 2), y: town.y + 2 },
      wood: 10,
      stone: 2
    }
  }

  if (count('workshop') === 0) {
    return { kind: 'workshop', position: { x: town.x, y: town.y + 3 }, wood: 14, stone: 8 }
  }

  return null
}

function getDesiredResource(world: WorldSave['world']): ResourceKind {
  const nextBuilding = getNextBuilding(world)
  const adminScript = world.scriptProfiles.find((profile) => profile.id === 'admin-core')

  if (!nextBuilding) {
    if (world.focus === 'wood') return 'tree'
    if (world.focus === 'stone') return 'stone'
    const woodBias = adminScript?.params.woodBias ?? 0.5
    const stoneBias = adminScript?.params.stoneBias ?? 0.5
    if (Math.abs(woodBias - stoneBias) > 0.08) {
      return woodBias >= stoneBias ? 'tree' : 'stone'
    }
    return world.stockpile.wood <= world.stockpile.stone ? 'tree' : 'stone'
  }

  const woodGap = Math.max(0, nextBuilding.wood - world.stockpile.wood)
  const stoneGap = Math.max(0, nextBuilding.stone - world.stockpile.stone)

  if (world.focus === 'wood') return woodGap > 0 ? 'tree' : stoneGap > 0 ? 'stone' : 'tree'
  if (world.focus === 'stone') return stoneGap > 0 ? 'stone' : woodGap > 0 ? 'tree' : 'stone'
  if (stoneGap > woodGap) return 'stone'
  return 'tree'
}

function findNearestResource(world: WorldSave['world'], origin: Point, kind: ResourceKind): ResourceNode | null {
  const targetKind = kind === 'tree' ? 'tree' : 'stone'
  const candidates = world.resources.filter((resource) => resource.kind === targetKind && resource.amount > 0)
  if (candidates.length === 0) {
    return null
  }
  return candidates.reduce((best, current) => (manhattan(origin, current.position) < manhattan(origin, best.position) ? current : best))
}

function spendStockpile(world: WorldSave['world'], wood: number, stone: number): boolean {
  if (world.stockpile.wood < wood || world.stockpile.stone < stone) {
    return false
  }
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
    progress: 1,
    complete: true
  }
  world.buildings.push(building)
  return building
}

function maybeSpawnNpc(save: WorldSave, admin: AgentState): void {
  const huts = save.world.buildings.filter((building) => building.kind === 'hut' && building.complete).length
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  const adminScript = save.world.scriptProfiles.find((profile) => profile.id === admin.scriptId)

  if (huts === 0) return
  if (npcCount >= huts) return
  if (save.world.focus === 'tidy') return
  if ((adminScript?.params.spawnBias ?? 0.5) < 0.35) return
  if (save.world.agents.length >= save.world.authority.maxAgents) return
  if (!spendStockpile(save.world, 8, 2)) return

  const speciesCycle: AgentSpecies[] = ['cat', 'dog', 'sheep', 'lobster']
  const npc = createAgent(
    `Worker ${npcCount + 1}`,
    speciesCycle[npcCount % speciesCycle.length],
    'npc',
    { x: save.world.townCenter.x + npcCount + 1, y: save.world.townCenter.y + 1 }
  )
  npc.focus = save.world.focus
  addMemory(npc, save.world.authority, 'observation', '我在新建成的城镇里诞生，准备服从管理员。')
  save.world.agents.push(npc)
  addMemory(admin, save.world.authority, 'action', `我扩编了新的小 Agent：${npc.name}。`)
  save.meta.agentCount = save.world.agents.length
}

function depositAtTown(world: WorldSave['world'], agent: AgentState): boolean {
  if (!samePoint(agent.position, world.townCenter)) return false
  if (agent.inventory.wood === 0 && agent.inventory.stone === 0) return false

  world.stockpile.wood += agent.inventory.wood
  world.stockpile.stone += agent.inventory.stone
  agent.inventory.wood = 0
  agent.inventory.stone = 0
  return true
}

function maybeHarvest(world: WorldSave['world'], agent: AgentState, resource: ResourceNode): boolean {
  if (!samePoint(agent.position, resource.position)) return false
  if (resource.amount <= 0) return false
  const currentCarry = agent.inventory.wood + agent.inventory.stone
  if (currentCarry >= CARRY_CAPACITY) return false

  resource.amount -= 1
  if (resource.kind === 'tree') {
    agent.inventory.wood += 1
  } else {
    agent.inventory.stone += 1
  }
  return true
}

function cleanupResources(world: WorldSave['world']): void {
  world.resources = world.resources.filter((resource) => resource.amount > 0)
}

function directNpcFocus(world: WorldSave['world'], npcIndex: number): ResourceKind {
  if (world.focus === 'wood') return 'tree'
  if (world.focus === 'stone') return 'stone'
  return npcIndex % 2 === 0 ? 'tree' : 'stone'
}

function advanceAgent(save: WorldSave, agent: AgentState, index: number): void {
  const { world } = save

  if (depositAtTown(world, agent)) {
    agent.currentTask = '把资源存入城镇库存'
    addMemory(agent, world.authority, 'action', '我把资源送回了城镇。')
    return
  }

  const carrying = agent.inventory.wood + agent.inventory.stone
  if (carrying > 0) {
    agent.currentTask = '返回城镇交付资源'
    agent.position = moveStep(agent.position, world.townCenter, world.width, world.height)
    return
  }

  if (agent.role === 'admin') {
    const nextBuilding = getNextBuilding(world)
    if (nextBuilding && world.buildings.length < world.authority.maxBuildings) {
      const enough = world.stockpile.wood >= nextBuilding.wood && world.stockpile.stone >= nextBuilding.stone
      if (enough) {
        agent.currentTask = `前往工地建设 ${nextBuilding.kind}`
        agent.position = moveStep(agent.position, nextBuilding.position, world.width, world.height)
        if (samePoint(agent.position, nextBuilding.position) && spendStockpile(world, nextBuilding.wood, nextBuilding.stone)) {
          completeBuilding(world, nextBuilding.kind, nextBuilding.position)
          addMemory(agent, world.authority, 'action', `我完成了 ${nextBuilding.kind} 的建设。`)
          save.meta.buildingCount = world.buildings.length
          if (nextBuilding.kind === 'hut') {
            maybeSpawnNpc(save, agent)
          }
        }
        return
      }
    }
  }

  const desiredResource = agent.role === 'admin' ? getDesiredResource(world) : directNpcFocus(world, index)
  const resource = findNearestResource(world, agent.position, desiredResource)

  if (!resource) {
    agent.currentTask = '巡逻并观察荒野'
    agent.position = moveStep(
      agent.position,
      {
        x: world.townCenter.x + ((index % 3) - 1) * 2,
        y: world.townCenter.y + ((index % 2) - 1) * 2
      },
      world.width,
      world.height
    )
    return
  }

  agent.currentTask = desiredResource === 'tree' ? '前往森林砍树' : '前往采石点搬运石料'
  agent.position = moveStep(agent.position, resource.position, world.width, world.height)
  if (maybeHarvest(world, agent, resource)) {
    addMemory(
      agent,
      world.authority,
      'action',
      resource.kind === 'tree' ? '我砍下一单位木材。' : '我采集了一单位石头。'
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
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: now,
    seed,
    agentCount: 1,
    buildingCount: 0,
    tokenTotal: 0,
    lastHourTokens: 0,
    focus: 'expand',
    description: '一个从荒野中自我生长的俯视角自治世界。'
  }
}

export function createNewWorldSave(draft: SaveDraft): WorldSave {
  const seed = draft.seed ?? Math.floor(Math.random() * 100_000)
  const random = mulberry32(seed)
  const width = defaultAuthorityLimits.mapWidth
  const height = defaultAuthorityLimits.mapHeight
  const terrain = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const noise = (Math.sin((x + seed) * 0.18) + Math.cos((y - seed) * 0.11) + random() * 0.8) / 2.8 + 0.5
      if (noise < 0.2) return 'water'
      if (noise < 0.34) return 'forest'
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
      if (tile === 'forest' && random() > 0.38) {
        resources.push({
          id: createId('tree'),
          kind: 'tree',
          scriptId: 'resource-node',
          position: { x, y },
          amount: 3 + Math.floor(random() * 4)
        })
      }
      if (tile === 'stone' && random() > 0.45) {
        resources.push({
          id: createId('stone'),
          kind: 'stone',
          scriptId: 'resource-node',
          position: { x, y },
          amount: 4 + Math.floor(random() * 5)
        })
      }
    }
  }

  const meta = createMeta(draft, seed)
  const admin = createAgent('Admin', draft.species, 'admin', townCenter)
  addMemory(admin, defaultAuthorityLimits, 'plan', '我的默认目标是建设城镇并发展更多小 Agent。')

  return {
    version: WORLD_VERSION,
    meta,
    settings: {
      focus: 'expand'
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
        position: { x: townCenter.x, y: townCenter.y + 1 }
      },
      stockpile: {
        wood: 0,
        stone: 0
      },
      terrain,
      resources,
      buildings: [],
      agents: [admin],
      chatLog: [
        createSystemMessage('世界启动：Admin Agent 会优先建设城镇、积累资源，并在预算范围内培育更多小 Agent。')
      ],
      tokenLedger: [],
      scriptProfiles: [createDefaultScriptProfile(admin.id)],
      scriptEvents: [
        {
          id: createId('script-event'),
          scriptId: 'admin-core',
          actorId: admin.id,
          timestamp: Date.now(),
          status: 'approved',
          summary: 'Authority 已批准 Admin Core Script v1，用于建设城镇并发展更多小 Agent。'
        }
      ],
      authority: { ...defaultAuthorityLimits }
    }
  }
}

export function tickWorld(save: WorldSave): WorldSave {
  const clone = structuredClone(save) as WorldSave
  clone.world.time += 1

  clone.world.agents.forEach((agent, index) => {
    agent.focus = clone.world.focus
    advanceAgent(clone, agent, index)
  })

  cleanupResources(clone.world)
  clone.meta.updatedAt = Date.now()
  clone.meta.lastPlayedAt = Date.now()
  clone.meta.agentCount = clone.world.agents.length
  clone.meta.buildingCount = clone.world.buildings.length
  return clone
}

export function getWorldSummary(save: WorldSave): string {
  const huts = save.world.buildings.filter((building) => building.kind === 'hut').length
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  return [
    `世界 ${save.meta.name}`,
    `时间刻 ${save.world.time}`,
    `焦点 ${save.world.focus}`,
    `库存 木材${save.world.stockpile.wood} 石头${save.world.stockpile.stone}`,
    `建筑 ${save.world.buildings.length}（小屋 ${huts}）`,
    `代理 ${save.world.agents.length}（NPC ${npcCount}）`,
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
    return {
      accepted: false,
      reason: 'Authority 拒绝了危险请求：该命令会突破稳定性边界或明显威胁运行安全。'
    }
  }

  if (/(agent|npc|小 agent|小agent)/.test(text) && requestedCount > save.world.authority.maxAgents - npcCount) {
    return {
      accepted: false,
      reason: `Authority 拒绝了扩员请求：当前世界最多支持 ${save.world.authority.maxAgents} 个活跃 Agent。`
    }
  }

  return { accepted: true }
}

export function appendChat(save: WorldSave, role: ChatMessage['role'], content: string): WorldSave {
  const clone = structuredClone(save) as WorldSave
  clone.world.chatLog.push({
    id: createId('chat'),
    role,
    content,
    timestamp: Date.now()
  })
  return clone
}

export function applyFocus(save: WorldSave, focus: FocusGoal): WorldSave {
  const clone = structuredClone(save) as WorldSave
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
      if (record.timestamp >= now - 60 * 60 * 1000) {
        summary.lastHour += record.totalTokens
      }
      return summary
    },
    {
      totalTokens: 0,
      byProvider: {},
      byAgent: {},
      byType: {},
      lastHour: 0
    }
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

    return {
      label: `${new Date(bucketStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      total
    }
  })
}

export function deriveSaveMeta(save: WorldSave, now = Date.now()): SaveMeta {
  const tokenSummary = summarizeTokenUsage(save.world.tokenLedger, now)
  return {
    ...save.meta,
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
    settings?: { focus?: unknown }
    world?: Partial<WorldSave['world']>
  }

  const focus = focusGoalSchema.safeParse(candidate.world?.focus ?? candidate.settings?.focus ?? candidate.meta?.focus).success
    ? focusGoalSchema.parse(candidate.world?.focus ?? candidate.settings?.focus ?? candidate.meta?.focus)
    : 'expand'

  const normalized = {
    version: 1,
    ...candidate,
    meta: {
      id: candidate.meta?.id ?? createId('world'),
      name: candidate.meta?.name ?? 'Recovered World',
      species: candidate.meta?.species ?? 'lobster',
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
      focus
    },
    world: {
      width: candidate.world?.width ?? defaultAuthorityLimits.mapWidth,
      height: candidate.world?.height ?? defaultAuthorityLimits.mapHeight,
      seed: candidate.world?.seed ?? candidate.meta?.seed ?? 0,
      time: candidate.world?.time ?? 0,
      focus,
      townCenter: candidate.world?.townCenter ?? { x: 32, y: 32 },
      player: candidate.world?.player ?? {
        name: 'God Avatar',
        position: candidate.world?.townCenter ?? { x: 32, y: 33 }
      },
      stockpile: candidate.world?.stockpile ?? { wood: 0, stone: 0 },
      terrain: candidate.world?.terrain ?? [],
      resources: candidate.world?.resources ?? [],
      buildings: candidate.world?.buildings ?? [],
      agents: candidate.world?.agents ?? [],
      chatLog: candidate.world?.chatLog ?? [],
      tokenLedger: candidate.world?.tokenLedger ?? [],
      scriptProfiles:
        candidate.world?.scriptProfiles && candidate.world.scriptProfiles.length > 0
          ? candidate.world.scriptProfiles
          : candidate.world?.agents?.[0]
            ? [createDefaultScriptProfile(candidate.world.agents[0].id)]
            : [],
      scriptEvents: candidate.world?.scriptEvents ?? [],
      authority: {
        ...defaultAuthorityLimits,
        ...candidate.world?.authority
      }
    }
  }

  const parsed = normalized as WorldSave
  parsed.world.resources = parsed.world.resources.map((resource) => ({
    ...resource,
    scriptId: resource.scriptId ?? 'resource-node'
  }))
  parsed.world.buildings = parsed.world.buildings.map((building) => ({
    ...building,
    scriptId: building.scriptId ?? (building.complete ? 'settlement-structure' : 'build-site')
  }))
  parsed.world.agents = parsed.world.agents.map((agent) => ({
    ...agent,
    scriptId: agent.scriptId ?? (agent.role === 'admin' ? 'admin-core' : 'settlement-worker')
  }))
  return {
    ...parsed,
    meta: deriveSaveMeta(parsed, parsed.meta.updatedAt || Date.now())
  }
}

export function getAuthoritySnapshot(save: WorldSave) {
  const agentLoad = save.world.agents.length / save.world.authority.maxAgents
  const buildingLoad = save.world.buildings.length / save.world.authority.maxBuildings
  const memoryCapacity = save.world.authority.maxMemoriesPerAgent * Math.max(save.world.agents.length, 1)
  const memoryUsage = save.world.agents.reduce((sum, agent) => sum + agent.memories.length + agent.memorySummary.length, 0)
  const memoryLoad = memoryUsage / memoryCapacity

  return {
    agentLoad,
    buildingLoad,
    memoryLoad,
    memoryUsage,
    memoryCapacity
  }
}
