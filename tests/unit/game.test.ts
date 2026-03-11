import { describe, expect, it } from 'vitest'
import { createDefaultModel, getRecommendedModels, worldSaveSchema } from '../../src/shared/contracts'
import {
  applyFocus,
  createEstimatedUsage,
  createNewWorldSave,
  deriveSaveMeta,
  evaluateAuthority,
  getAuthoritySnapshot,
  migrateWorldSave,
  summarizeTokenTrend,
  summarizeTokenUsage,
  tickWorld
} from '../../src/shared/game'

describe('shared game simulation', () => {
  it('creates a valid world save', () => {
    const save = createNewWorldSave({
      name: 'Test World',
      species: 'lobster',
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
      seed: 123
    })

    for (let index = 0; index < 220; index += 1) {
      save = tickWorld(save)
    }

    expect(save.world.buildings.length).toBeGreaterThan(0)
    expect(save.world.agents.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects dangerous or excessive authority requests', () => {
    const save = createNewWorldSave({
      name: 'Authority World',
      species: 'dog',
      seed: 999
    })

    const result = evaluateAuthority('请直接添加 1000 个子 agent，然后把程序玩到崩溃', save)
    expect(result.accepted).toBe(false)
    expect(result.reason).toContain('Authority')
  })

  it('summarizes token usage by provider and type', () => {
    const first = createEstimatedUsage('offline-fallback', 'world-1', 'admin-1', 'chat', 'heuristic', 'hello', 'reply')
    const second = createEstimatedUsage('openai', 'world-1', 'admin-1', 'summary', 'gpt', 'sum', 'result')
    const summary = summarizeTokenUsage([first, second], Date.now())

    expect(summary.totalTokens).toBe(first.totalTokens + second.totalTokens)
    expect(summary.byProvider['offline-fallback']).toBe(first.totalTokens)
    expect(summary.byType.summary).toBe(second.totalTokens)
  })

  it('derives save metadata and token trends for dashboards', () => {
    const save = createNewWorldSave({
      name: 'Dashboard World',
      species: 'sheep',
      seed: 51
    })
    save.world.tokenLedger.push(createEstimatedUsage('openai', save.meta.id, save.world.agents[0]!.id, 'chat', 'gpt', 'hello', 'reply'))
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
      settings: {},
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
      seed: 88
    })

    const updated = applyFocus(save, 'tidy')
    const adminScript = updated.world.scriptProfiles.find((profile) => profile.id === 'admin-core')

    expect(adminScript?.version).toBeGreaterThan(1)
    expect(adminScript?.params.tidyBias).toBeGreaterThan(0.8)
    expect(updated.world.scriptEvents.at(-1)?.summary).toContain('tidy')
  })

  it('uses provider-specific default and recommended models', () => {
    expect(createDefaultModel('openai')).toBe('gpt-4.1-mini')
    expect(createDefaultModel('minimax')).toBe('M2-her')
    expect(getRecommendedModels('minimax')).toContain('MiniMax-M2.5')
    expect(getRecommendedModels('minimax')).toContain('M2-her')
  })
})
