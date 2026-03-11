import { create } from 'zustand'
import type { BootstrapState, SaveMeta, WorldSave } from '@shared/contracts'

type AppPhase = 'loading' | 'onboarding' | 'saves' | 'world'

type AppState = {
  phase: AppPhase
  bootstrap: BootstrapState | null
  saves: SaveMeta[]
  currentSave: WorldSave | null
  compactMode: boolean
  setBootstrap: (bootstrap: BootstrapState) => void
  setPhase: (phase: AppPhase) => void
  setSaves: (saves: SaveMeta[]) => void
  setCurrentSave: (save: WorldSave | null) => void
  setCompactMode: (compactMode: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  phase: 'loading',
  bootstrap: null,
  saves: [],
  currentSave: null,
  compactMode: false,
  setBootstrap: (bootstrap) =>
    set({
      bootstrap,
      saves: bootstrap.saves,
      compactMode: bootstrap.windowMode === 'compact',
      phase: bootstrap.settings.apiKey || bootstrap.settings.offlineMode ? 'saves' : 'onboarding'
    }),
  setPhase: (phase) => set({ phase }),
  setSaves: (saves) => set({ saves }),
  setCurrentSave: (currentSave) => set({ currentSave }),
  setCompactMode: (compactMode) => set({ compactMode })
}))
