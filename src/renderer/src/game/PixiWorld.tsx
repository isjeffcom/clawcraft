import { useEffect, useMemo, useRef, useState } from 'react'
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
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [rendererMode, setRendererMode] = useState<'pixi' | 'fallback'>('pixi')
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
      const host = hostRef.current
      const rect = host.getBoundingClientRect()
      const width = Math.max(320, Math.floor(rect.width || host.clientWidth || 960))
      const height = Math.max(240, Math.floor(rect.height || host.clientHeight || 640))

      try {
        const app = new Application()
        await app.init({
          width,
          height,
          preference: 'webgl',
          backgroundColor: 0x081225,
          backgroundAlpha: 1,
          antialias: false,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1
        })
        if (disposed) {
          app.destroy(true)
          return
        }

        app.canvas.style.width = '100%'
        app.canvas.style.height = '100%'
        app.canvas.style.display = 'block'
        host.appendChild(app.canvas)
        const terrain = new Container()
        const resources = new Container()
        const buildings = new Container()
        const agents = new Container()
        const hud = new Container()
        app.stage.addChild(terrain, resources, buildings, agents, hud)
        appRef.current = app
        layersRef.current = { terrain, resources, buildings, agents, hud }
        setRendererMode('pixi')
        resizeObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry || !appRef.current) return
          const nextWidth = Math.max(320, Math.floor(entry.contentRect.width))
          const nextHeight = Math.max(240, Math.floor(entry.contentRect.height))
          appRef.current.renderer.resize(nextWidth, nextHeight)
          renderWorld()
        })
        resizeObserverRef.current.observe(host)
        renderWorld()
      } catch {
        setRendererMode('fallback')
      }
    }

    void mount()

    return () => {
      disposed = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
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

  const fallbackView = useMemo(() => {
    const tileSize = compact ? 12 : 18
    const visibleCols = compact ? 24 : 36
    const visibleRows = compact ? 18 : 24
    const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]
    const cameraCenter = compact ? admin.position : save.world.townCenter
    const startX = Math.max(0, Math.min(save.world.width - visibleCols, cameraCenter.x - Math.floor(visibleCols / 2)))
    const startY = Math.max(0, Math.min(save.world.height - visibleRows, cameraCenter.y - Math.floor(visibleRows / 2)))

    return {
      tileSize,
      visibleCols,
      visibleRows,
      startX,
      startY,
      admin
    }
  }, [compact, save])

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

    const background = new Graphics()
    background.rect(0, 0, viewWidth, viewHeight).fill(0x081225)
    terrain.addChild(background)

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

    if (!compact) {
      const tip = new Text({
        text: `渲染模式：2D 俯视角｜视口 ${visibleCols}x${visibleRows}`,
        style: {
          fill: '#7dd3fc',
          fontSize: 12,
          fontWeight: '500'
        }
      })
      tip.x = 12
      tip.y = 30
      hud.addChild(tip)
    }
  }

  if (rendererMode === 'fallback') {
    return <DomWorldFallback save={save} compact={compact} {...fallbackView} />
  }

  return <div ref={hostRef} className="h-full min-h-[320px] w-full overflow-hidden rounded-2xl" />
}

function DomWorldFallback({
  save,
  compact,
  tileSize,
  visibleCols,
  visibleRows,
  startX,
  startY,
  admin
}: Props & {
  tileSize: number
  visibleCols: number
  visibleRows: number
  startX: number
  startY: number
  admin: WorldSave['world']['agents'][number]
}) {
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#081225]">
      <div className="absolute left-3 top-3 z-20 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
        渲染后备模式
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${visibleCols}, ${tileSize}px)`,
          gridTemplateRows: `repeat(${visibleRows}, ${tileSize}px)`,
          width: visibleCols * tileSize,
          height: visibleRows * tileSize
        }}
      >
        {Array.from({ length: visibleRows }, (_row, y) =>
          Array.from({ length: visibleCols }, (_col, x) => {
            const tile = save.world.terrain[startY + y]?.[startX + x] ?? 'grass'
            return (
              <div
                key={`${x}-${y}`}
                style={{
                  width: tileSize,
                  height: tileSize,
                  background: `#${(TILE_COLORS[tile] ?? 0x1e293b).toString(16).padStart(6, '0')}`,
                  border: '1px solid rgba(15, 23, 42, 0.12)'
                }}
              />
            )
          })
        )}
      </div>

      {save.world.resources.map((resourceNode) => {
        if (
          resourceNode.position.x < startX ||
          resourceNode.position.x >= startX + visibleCols ||
          resourceNode.position.y < startY ||
          resourceNode.position.y >= startY + visibleRows
        ) {
          return null
        }

        const left = (resourceNode.position.x - startX) * tileSize
        const top = (resourceNode.position.y - startY) * tileSize
        return (
          <div
            key={resourceNode.id}
            className="absolute rounded-full"
            style={{
              left: left + tileSize * 0.25,
              top: top + tileSize * 0.25,
              width: tileSize * 0.5,
              height: tileSize * 0.5,
              background: resourceNode.kind === 'tree' ? '#22c55e' : '#94a3b8',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08)'
            }}
          />
        )
      })}

      {save.world.buildings.map((building) => {
        if (
          building.position.x < startX ||
          building.position.x >= startX + visibleCols ||
          building.position.y < startY ||
          building.position.y >= startY + visibleRows
        ) {
          return null
        }

        const left = (building.position.x - startX) * tileSize
        const top = (building.position.y - startY) * tileSize
        const color =
          building.kind === 'campfire'
            ? '#f97316'
            : building.kind === 'storage'
              ? '#facc15'
              : building.kind === 'hut'
                ? '#fb7185'
                : '#22d3ee'

        return (
          <div
            key={building.id}
            className="absolute rounded-md"
            style={{
              left: left + 1,
              top: top + 1,
              width: tileSize - 2,
              height: tileSize - 2,
              background: color,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
            }}
          />
        )
      })}

      {save.world.agents.map((agent) => {
        if (
          agent.position.x < startX ||
          agent.position.x >= startX + visibleCols ||
          agent.position.y < startY ||
          agent.position.y >= startY + visibleRows
        ) {
          return null
        }

        const left = (agent.position.x - startX) * tileSize
        const top = (agent.position.y - startY) * tileSize
        return (
          <div
            key={agent.id}
            className="absolute flex items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              left: left + tileSize * 0.18,
              top: top + tileSize * 0.18,
              width: tileSize * 0.64,
              height: tileSize * 0.64,
              background: agent.color,
              color: '#020617',
              border: agent.role === 'admin' ? '2px solid #f8fafc' : '1px solid rgba(255,255,255,0.15)'
            }}
          >
            {agent.role === 'admin' ? 'A' : 'N'}
          </div>
        )
      })}

      <div className="absolute left-3 right-3 top-10 z-20 rounded-2xl bg-slate-950/55 px-3 py-2 text-xs text-slate-100">
        {compact ? `Admin：${admin.currentTask}` : `${save.meta.name}｜库存 木:${save.world.stockpile.wood} 石:${save.world.stockpile.stone}`}
      </div>
    </div>
  )
}
