import { describe, expect, it, vi } from 'vitest'
import { createDefaultModel, getRecommendedModels, worldSaveSchema } from '../../src/shared/contracts'
import {
  applyFocus,
  createEstimatedUsage,
  createNewWorldSave,
  deriveSaveMeta,
  evaluateAuthority,
  getAuthoritySnapshot,
  migrateWorldSave,
  isWalkableTile,
  summarizeTokenTrend,
  summarizeTokenUsage,
  tickWorld
} from '../../src/shared/game'

describe('shared game simulation', () => {
  it('creates a valid world save', () => {
    const save = createNewWorldSave({
      name: 'Test World',
      species: 'lobster',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 42
    })

    expect(() => worldSaveSchema.parse(save)).not.toThrow()
    expect(save.world.agents[0]?.role).toBe('admin')
    expect(save.world.focus).toBe('expand')
    expect(save.world.player.position.y).toBeGreaterThanOrEqual(save.world.townCenter.y)
  })

  it('lets the admin build a town over time', () => {
    let save = createNewWorldSave({
      name: 'Growth World',
      species: 'cat',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 123
    })

    for (let index = 0; index < 220; index += 1) {
      save = tickWorld(save)
    }

    expect(save.world.buildings.length).toBeGreaterThan(0)
    expect(save.world.agents.length).toBeGreaterThanOrEqual(1)
  })

  it('makes admin return to town after harvesting resources', () => {
    let save = createNewWorldSave({
      name: 'Admin Return World',
      species: 'cat',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 606
    })

    const admin = save.world.agents[0]!
    save.world.focus = 'wood'
    save.settings.focus = 'wood'
    save.world.llmPolicy.nextAdminAction = 'gatherWood'
    save.world.resources = [
      {
        id: 'tree-near',
        kind: 'tree',
        scriptId: 'resource-node',
        position: { x: save.world.townCenter.x + 2, y: save.world.townCenter.y },
        amount: 2
      }
    ]
    admin.position = { x: save.world.townCenter.x + 1, y: save.world.townCenter.y }
    admin.renderPosition = { x: save.world.townCenter.x + 1, y: save.world.townCenter.y }

    const initialWood = save.world.stockpile.wood

    for (let index = 0; index < 14; index += 1) {
      save = tickWorld(save)
    }

    expect(save.world.stockpile.wood).toBeGreaterThan(initialWood)
    expect(save.world.agents[0]?.currentTask === '回城' || save.world.agents[0]?.position.x === save.world.townCenter.x).toBe(true)
  })

  it('lets npc harvest from a walkable tile beside the resource', () => {
    let save = createNewWorldSave({
      name: 'Harvest World',
      species: 'cat',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 321
    })

    save.world.focus = 'wood'
    save.settings.focus = 'wood'
    save.world.resources = [
      {
        id: 'tree-1',
        kind: 'tree',
        scriptId: 'resource-node',
        position: { x: save.world.townCenter.x + 2, y: save.world.townCenter.y + 1 },
        amount: 3
      }
    ]
    save.world.agents[1]!.position = { x: save.world.townCenter.x + 1, y: save.world.townCenter.y + 1 }
    save.world.agents[1]!.renderPosition = { x: save.world.townCenter.x + 1, y: save.world.townCenter.y + 1 }

    save = tickWorld(save)
    expect(
      Math.max(
        Math.abs((save.world.agents[1]?.position.x ?? 0) - (save.world.townCenter.x + 2)),
        Math.abs((save.world.agents[1]?.position.y ?? 0) - (save.world.townCenter.y + 1))
      )
    ).toBe(1)

    for (let index = 0; index < 13; index += 1) {
      save = tickWorld(save)
    }

    const remainingResource = save.world.resources.find((resource) => resource.id === 'tree-1')
    expect(remainingResource ? remainingResource.amount < 3 : true).toBe(true)
  })

  it('lets npc route around blockers to reach a resource tile', () => {
    let save = createNewWorldSave({
      name: 'Routing World',
      species: 'cat',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 404
    })

    save.world.focus = 'wood'
    save.settings.focus = 'wood'
    save.world.buildings = [
      ...save.world.buildings,
      {
        id: 'storage-blocker',
        kind: 'storage',
        scriptId: 'settlement-structure',
        position: { x: save.world.townCenter.x + 2, y: save.world.townCenter.y + 1 },
        rotation: 0,
        progress: 1,
        complete: true
      }
    ]
    save.world.resources = [
      {
        id: 'tree-route',
        kind: 'tree',
        scriptId: 'resource-node',
        position: { x: save.world.townCenter.x + 4, y: save.world.townCenter.y + 1 },
        amount: 4
      }
    ]
    save.world.agents[1]!.position = { x: save.world.townCenter.x + 1, y: save.world.townCenter.y + 1 }
    save.world.agents[1]!.renderPosition = { x: save.world.townCenter.x + 1, y: save.world.townCenter.y + 1 }

    for (let index = 0; index < 10; index += 1) {
      save = tickWorld(save)
    }

    expect(
      Math.max(
        Math.abs((save.world.agents[1]?.position.x ?? 0) - (save.world.townCenter.x + 4)),
        Math.abs((save.world.agents[1]?.position.y ?? 0) - (save.world.townCenter.y + 1))
      )
    ).toBe(1)
  })

  it('skips unreachable resources instead of fixating on them', () => {
    let save = createNewWorldSave({
      name: 'Fallback Route World',
      species: 'dog',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 505
    })

    save.world.focus = 'wood'
    save.settings.focus = 'wood'
    save.world.resources = [
      {
        id: 'blocked-tree',
        kind: 'tree',
        scriptId: 'resource-node',
        position: { x: save.world.townCenter.x + 4, y: save.world.townCenter.y },
        amount: 4
      },
      {
        id: 'reachable-tree',
        kind: 'tree',
        scriptId: 'resource-node',
        position: { x: save.world.townCenter.x - 3, y: save.world.townCenter.y + 1 },
        amount: 4
      }
    ]
    save.world.buildings = [
      ...save.world.buildings,
      {
        id: 'blocker-a',
        kind: 'storage',
        scriptId: 'settlement-structure',
        position: { x: save.world.townCenter.x + 3, y: save.world.townCenter.y },
        rotation: 0,
        progress: 1,
        complete: true
      },
      {
        id: 'blocker-b',
        kind: 'hut',
        scriptId: 'settlement-structure',
        position: { x: save.world.townCenter.x + 5, y: save.world.townCenter.y },
        rotation: 0,
        progress: 1,
        complete: true
      }
    ]

    for (let index = 0; index < 12; index += 1) {
      save = tickWorld(save)
    }

    expect(save.world.resources.find((resource) => resource.id === 'reachable-tree')?.amount).toBeLessThan(4)
  })

  it('treats static town props as blocking tiles', () => {
    const save = createNewWorldSave({
      name: 'Collision World',
      species: 'dog',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 202
    })

    expect(
      isWalkableTile(
        save.world,
        { x: save.world.townCenter.x + 1, y: save.world.townCenter.y + 2 },
        { ignoreResources: true }
      )
    ).toBe(false)
  })

  it('allows emo agents to recover over time', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1)
    let save = createNewWorldSave({
      name: 'Recovery World',
      species: 'sheep',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 707
    })

    const npcId = save.world.agents[1]!.id
    save.world.agents[1]!.position = { ...save.world.townCenter }
    save.world.agents[1]!.renderPosition = { x: save.world.townCenter.x, y: save.world.townCenter.y }
    save.world.agents[1]!.mental = 20
    save.world.agents[1]!.mood = 'emo'

    for (let index = 0; index < 48; index += 1) {
      save = tickWorld(save)
    }

    randomSpy.mockRestore()
    const recovered = save.world.agents.find((agent) => agent.id === npcId)
    expect(recovered?.mental).toBeGreaterThan(20)
    expect(recovered?.mood).toBe('stable')
  })

  it('rejects dangerous or excessive authority requests', () => {
    const save = createNewWorldSave({
      name: 'Authority World',
      species: 'dog',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 999
    })

    const result = evaluateAuthority('请直接添加 1000 个子 agent，然后把程序玩到崩溃', save)
    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('Authority')
  })

  it('summarizes token usage by provider and type', () => {
    const first = createEstimatedUsage('offline-fallback', 'world-1', 'admin-1', 'chat', 'heuristic', 'hello', 'reply')
    const second = createEstimatedUsage('openrouter', 'world-1', 'admin-1', 'summary', 'gpt', 'sum', 'result')
    const summary = summarizeTokenUsage([first, second], Date.now())

    expect(summary.totalTokens).toBe(first.totalTokens + second.totalTokens)
    expect(summary.byProvider['offline-fallback']).toBe(first.totalTokens)
    expect(summary.byType.summary).toBe(second.totalTokens)
  })

  it('derives save metadata and token trends for dashboards', () => {
    const save = createNewWorldSave({
      name: 'Dashboard World',
      species: 'sheep',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 51
    })
    save.world.tokenLedger.push(createEstimatedUsage('openrouter', save.meta.id, save.world.agents[0]!.id, 'chat', 'gpt', 'hello', 'reply'))
    const meta = deriveSaveMeta(save)
    const trend = summarizeTokenTrend(save.world.tokenLedger, 10, 4, Date.now())

    expect(meta.tokenTotal).toBeGreaterThan(0)
    expect(meta.focus).toBe(save.world.focus)
    expect(trend).toHaveLength(4)
  })

  it('migrates legacy saves and derives authority snapshots', () => {
    const legacy = {
      version: 1,
      meta: {
        id: 'legacy-world',
        name: 'Legacy World',
        species: 'lobster',
        createdAt: 1,
        updatedAt: 2,
        lastPlayedAt: 3,
        seed: 44,
        agentCount: 1,
        buildingCount: 0,
        description: 'old schema'
      },
      settings: {
        renderMode: '2d',
        decisionEngine: 'minimax-llm'
      },
      world: {
        width: 64,
        height: 64,
        seed: 44,
        time: 3,
        townCenter: { x: 32, y: 32 },
        terrain: Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => 'grass')),
        resources: [],
        buildings: [],
        agents: [
          {
            id: 'admin',
            name: 'Admin',
            species: 'lobster',
            role: 'admin',
            position: { x: 32, y: 32 },
            inventory: { wood: 0, stone: 0 },
            currentTask: 'idle',
            actionTicks: 0,
            ageTicks: 0,
            maxAgeTicks: 4000,
            mental: 80,
            mood: 'stable',
            plan: 'build town',
            focus: 'expand',
            memories: [],
            memorySummary: [],
            color: '#fff'
          }
        ],
        chatLog: [],
        authority: {
          maxAgents: 8,
          maxBuildings: 30,
          maxMemoriesPerAgent: 24,
          maxQueuedTasks: 16,
          mapWidth: 64,
          mapHeight: 64
        }
      }
    }

    const migrated = migrateWorldSave(legacy)
    const authority = getAuthoritySnapshot(migrated)
    expect(migrated.meta.focus).toBe('expand')
    expect(migrated.meta.tokenTotal).toBe(0)
    expect(authority.agentLoad).toBeGreaterThan(0)
  })

  it('updates the admin script profile when focus changes', () => {
    const save = createNewWorldSave({
      name: 'Script World',
      species: 'cat',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 88
    })

    const updated = applyFocus(save, 'tidy')
    const adminScript = updated.world.scriptProfiles.find((profile) => profile.id === 'admin-core')

    expect(adminScript?.version).toBeGreaterThan(1)
    expect(adminScript?.params.tidyBias).toBeGreaterThan(0.8)
    expect(updated.world.scriptEvents.at(-1)?.summary).toContain('tidy')
  })

  it('does not append repeated script events when focus is unchanged', () => {
    const save = createNewWorldSave({
      name: 'Focus World',
      species: 'cat',
      renderMode: '3d',
      decisionEngine: 'minimax-llm',
      seed: 89
    })

    const first = applyFocus(save, 'expand')
    const second = applyFocus(first, 'expand')

    expect(second.world.scriptEvents).toHaveLength(first.world.scriptEvents.length)
  })

  it('uses openrouter defaults and recommended models', () => {
    expect(createDefaultModel('openrouter')).toBe('openai/gpt-5.4')
    expect(getRecommendedModels('openrouter')).toContain('openai/gpt-5.4')
  })
})
