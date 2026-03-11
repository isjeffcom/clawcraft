import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text } from 'pixi.js'
import type { WorldSave } from '@shared/contracts'

type Props = {
  save: WorldSave
  compact: boolean
}

const TILE_COLORS: Record<string, number> = {
  grass: 0x1f6f43,
  forest: 0x155e3b,
  water: 0x1d4ed8,
  stone: 0x475569,
  soil: 0x6b4f3c
}

export function PixiWorld({ save, compact }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const layersRef = useRef<{
    terrain: Container
    resources: Container
    buildings: Container
    agents: Container
    hud: Container
  } | null>(null)

  useEffect(() => {
    let disposed = false

    async function mount() {
      if (!hostRef.current || appRef.current) return

      const app = new Application()
      await app.init({
        resizeTo: hostRef.current,
        backgroundAlpha: 0,
        antialias: false
      })
      if (disposed) {
        app.destroy(true)
        return
      }

      hostRef.current.appendChild(app.canvas)
      const terrain = new Container()
      const resources = new Container()
      const buildings = new Container()
      const agents = new Container()
      const hud = new Container()
      app.stage.addChild(terrain, resources, buildings, agents, hud)
      appRef.current = app
      layersRef.current = { terrain, resources, buildings, agents, hud }
      renderWorld()
    }

    void mount()

    return () => {
      disposed = true
      appRef.current?.destroy(true, { children: true })
      appRef.current = null
      layersRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    renderWorld()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, compact])

  function renderWorld() {
    if (!appRef.current || !layersRef.current) return
    const app = appRef.current
    const { terrain, resources, buildings, agents, hud } = layersRef.current
    terrain.removeChildren()
    resources.removeChildren()
    buildings.removeChildren()
    agents.removeChildren()
    hud.removeChildren()

    const viewWidth = app.renderer.width || 800
    const viewHeight = app.renderer.height || 600
    const tileSize = compact ? 12 : 18
    const visibleCols = Math.max(12, Math.floor(viewWidth / tileSize))
    const visibleRows = Math.max(10, Math.floor(viewHeight / tileSize))
    const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]
    const cameraCenter = compact ? admin.position : save.world.townCenter
    const startX = Math.max(0, Math.min(save.world.width - visibleCols, cameraCenter.x - Math.floor(visibleCols / 2)))
    const startY = Math.max(0, Math.min(save.world.height - visibleRows, cameraCenter.y - Math.floor(visibleRows / 2)))

    const terrainGraphics = new Graphics()
    terrain.addChild(terrainGraphics)

    for (let y = 0; y < visibleRows; y += 1) {
      for (let x = 0; x < visibleCols; x += 1) {
        const worldX = startX + x
        const worldY = startY + y
        const tile = save.world.terrain[worldY]?.[worldX] ?? 'grass'
        terrainGraphics.rect(x * tileSize, y * tileSize, tileSize + 1, tileSize + 1).fill(TILE_COLORS[tile] ?? 0x1e293b)
      }
    }

    save.world.resources.forEach((resourceNode) => {
      if (
        resourceNode.position.x < startX ||
        resourceNode.position.x >= startX + visibleCols ||
        resourceNode.position.y < startY ||
        resourceNode.position.y >= startY + visibleRows
      ) {
        return
      }
      const localX = (resourceNode.position.x - startX) * tileSize
      const localY = (resourceNode.position.y - startY) * tileSize
      const resourceGraphic = new Graphics()
      if (resourceNode.kind === 'tree') {
        resourceGraphic.rect(localX + tileSize * 0.38, localY + tileSize * 0.55, tileSize * 0.24, tileSize * 0.3).fill(0x8b5a2b)
        resourceGraphic.circle(localX + tileSize / 2, localY + tileSize * 0.42, tileSize * 0.3).fill(0x22c55e)
      } else {
        resourceGraphic.circle(localX + tileSize / 2, localY + tileSize / 2, tileSize * 0.28).fill(0x94a3b8)
      }
      resources.addChild(resourceGraphic)
    })

    save.world.buildings.forEach((building) => {
      if (
        building.position.x < startX ||
        building.position.x >= startX + visibleCols ||
        building.position.y < startY ||
        building.position.y >= startY + visibleRows
      ) {
        return
      }
      const localX = (building.position.x - startX) * tileSize
      const localY = (building.position.y - startY) * tileSize
      const buildingGraphic = new Graphics()
      const color =
        building.kind === 'campfire'
          ? 0xf97316
          : building.kind === 'storage'
            ? 0xfacc15
            : building.kind === 'hut'
              ? 0xfb7185
              : 0x22d3ee
      buildingGraphic.roundRect(localX + 1, localY + 1, tileSize - 2, tileSize - 2, 3).fill(color)
      buildings.addChild(buildingGraphic)
    })

    save.world.agents.forEach((agent) => {
      if (
        agent.position.x < startX ||
        agent.position.x >= startX + visibleCols ||
        agent.position.y < startY ||
        agent.position.y >= startY + visibleRows
      ) {
        return
      }
      const localX = (agent.position.x - startX) * tileSize
      const localY = (agent.position.y - startY) * tileSize
      const body = new Graphics()
      body.circle(localX + tileSize / 2, localY + tileSize / 2, tileSize * 0.32).fill(agent.color)
      if (agent.role === 'admin') {
        body.circle(localX + tileSize / 2, localY + tileSize / 2, tileSize * 0.38).stroke({ color: 0xf8fafc, width: 2 })
      }
      agents.addChild(body)
      if (!compact) {
        const label = new Text({
          text: agent.role === 'admin' ? 'A' : 'N',
          style: {
            fill: '#020617',
            fontSize: Math.max(8, tileSize * 0.4),
            fontWeight: '700'
          }
        })
        label.x = localX + tileSize * 0.28
        label.y = localY + tileSize * 0.14
        agents.addChild(label)
      }
    })

    const info = new Text({
      text: compact
        ? `Admin：${admin.currentTask}`
        : `${save.meta.name}｜库存 木:${save.world.stockpile.wood} 石:${save.world.stockpile.stone}｜Agent:${save.world.agents.length}｜建筑:${save.world.buildings.length}`,
      style: {
        fill: '#e2e8f0',
        fontSize: compact ? 12 : 14,
        fontWeight: '600'
      }
    })
    info.x = 12
    info.y = 10
    hud.addChild(info)
  }

  return <div ref={hostRef} className="h-full w-full overflow-hidden rounded-2xl" />
}
