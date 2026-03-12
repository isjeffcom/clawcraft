import type { WorldSave } from '@shared/contracts'
import { addTokenUsage, applyFocus, getWorldSummary, tickWorld } from '@shared/game'

type Listener = (save: WorldSave) => void

export class GameRuntime {
  private save: WorldSave
  private listeners = new Set<Listener>()
  private timer: number | null = null
  private autosaveEvery = 20
  private plannerEvery = 12
  private tickCount = 0
  private planning = false
  private naming = new Set<string>()

  constructor(initialSave: WorldSave) {
    this.save = initialSave
  }

  getSnapshot(): WorldSave {
    return this.save
  }

  replaceSave(save: WorldSave): void {
    this.save = save
    this.emit()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.save)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(): void {
    if (this.timer !== null) return
    void this.ensureAgentIdentities()
    this.timer = window.setInterval(() => {
      if (this.tickCount % this.plannerEvery === 0) {
        void this.planBehavior()
      }
      if (this.tickCount % 8 === 0) {
        void this.ensureAgentIdentities()
      }
      this.save = tickWorld(this.save)
      this.tickCount += 1
      this.emit()
      if (this.tickCount % this.autosaveEvery === 0) {
        void this.persist()
      }
    }, 250)
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  async persist(): Promise<void> {
    await window.clawcraft.writeSave(this.save)
  }

  private async planBehavior(): Promise<void> {
    if (this.planning) return
    const admin = this.save.world.agents.find((agent) => agent.role === 'admin')
    if (!admin) return
    this.planning = true
    try {
      const response = await window.clawcraft.planAgentBehavior({
        worldId: this.save.meta.id,
        agentId: admin.id,
        decisionEngine: this.save.settings.decisionEngine,
        worldSummary: getWorldSummary(this.save),
        currentFocus: this.save.world.focus,
        adminTask: admin.currentTask
      })
      let next = structuredClone(this.save)
      next.world.llmPolicy = {
        nextAdminAction: response.action,
        rationale: response.rationale,
        source: response.usage?.provider === 'minimax-fallback' ? 'fallback' : 'minimax-llm',
        updatedAt: Date.now()
      }
      if (response.focus) {
        next = applyFocus(next, response.focus)
      }
      if (response.usage) {
        next = addTokenUsage(next, response.usage)
      }
      this.save = next
      this.emit()
    } finally {
      this.planning = false
    }
  }

  private async ensureAgentIdentities(): Promise<void> {
    const genericAgents = this.save.world.agents.filter(
      (agent) => (agent.name === 'Admin' || /^Settler \d+$/.test(agent.name)) && !this.naming.has(agent.id)
    )
    if (genericAgents.length === 0) return

    const existingNames = this.save.world.agents.map((agent) => agent.name)
    for (const agent of genericAgents) {
      this.naming.add(agent.id)
      try {
        const response = await window.clawcraft.nameAgent({
          worldId: this.save.meta.id,
          agentId: agent.id,
          worldSummary: getWorldSummary(this.save),
          species: agent.species,
          role: agent.role,
          existingNames
        })
        let next = structuredClone(this.save)
        const target = next.world.agents.find((item) => item.id === agent.id)
        if (!target) continue
        target.name = response.name
        target.plan = response.story
        target.memories.push({
          id: `memory_${Date.now()}`,
          timestamp: Date.now(),
          kind: 'summary',
          content: `我的名字是 ${response.name}。${response.story}`
        })
        next.world.chatLog.push({
          id: `chat_${Date.now()}`,
          role: 'system',
          content: `${response.name} 加入了世界：${response.story}`,
          timestamp: Date.now()
        })
        if (response.usage) {
          next = addTokenUsage(next, response.usage)
        }
        this.save = next
        existingNames.push(response.name)
        this.emit()
      } catch {
        // Keep fallback name if naming fails.
      } finally {
        this.naming.delete(agent.id)
      }
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.save))
  }
}
