import { describe, expect, it } from 'vitest'
import { worldSaveSchema } from '../../src/shared/contracts'
import {
  createEstimatedUsage,
  createNewWorldSave,
  deriveSaveMeta,
  evaluateAuthority,
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
})
