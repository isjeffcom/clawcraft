import { describe, expect, it } from 'vitest'
import { appendChat, applyFocus, createNewWorldSave, getWorldSummary } from '../../src/shared/game'

describe('world flow integration', () => {
  it('applies focus changes and appends chat entries', () => {
    const save = createNewWorldSave({
      name: 'Flow World',
      species: 'sheep',
      seed: 777
    })

    const focused = applyFocus(save, 'wood')
    const chatted = appendChat(focused, 'player', '先多砍树')

    expect(focused.world.focus).toBe('wood')
    expect(chatted.world.chatLog.at(-1)?.content).toContain('先多砍树')
    expect(getWorldSummary(chatted)).toContain('焦点 wood')
  })
})
