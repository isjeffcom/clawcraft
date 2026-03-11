import type { ClawcraftApi } from '../../preload/index'

declare global {
  interface Window {
    clawcraft: ClawcraftApi
  }
}

export {}
