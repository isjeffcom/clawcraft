import type { WorldSave } from '@shared/contracts'
import { PixiWorld } from './PixiWorld'
import { ThreeWorld } from './ThreeWorld'

type Props = {
  save: WorldSave
  compact: boolean
  onMovePlayer?: (position: { x: number; y: number }) => void
  playerTarget?: { x: number; y: number } | null
  observeAgentId?: string | null
  observeCameraOffset?: { x: number; y: number }
}

export function WorldRenderer(props: Props) {
  if (props.save.settings.renderMode === '2d') {
    return <PixiWorld {...props} />
  }
  return <ThreeWorld {...props} fallback={<PixiWorld {...props} />} />
}
