import type { WorldSave } from '@shared/contracts'
import { tickWorld } from '@shared/game'

type Listener = (save: WorldSave) => void

export class GameRuntime {
  private save: WorldSave
  private listeners = new Set<Listener>()
  private timer: number | null = null
  private autosaveEvery = 20
  private tickCount = 0

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
    this.timer = window.setInterval(() => {
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

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.save))
  }
}
