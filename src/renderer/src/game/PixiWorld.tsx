import { useEffect, useMemo, useRef, useState } from 'react'
import { Application, Assets, Container, Graphics, Sprite, Text } from 'pixi.js'
import type { TerrainType, WorldSave } from '@shared/contracts'

type Props = {
  save: WorldSave
  compact: boolean
  onMovePlayer?: (position: { x: number; y: number }) => void
  playerTarget?: { x: number; y: number } | null
}

const TILE_COLORS: Record<string, number> = {
  grass: 0x1f6f43,
  forest: 0x155e3b,
  water: 0x1d4ed8,
  stone: 0x475569,
  soil: 0x6b4f3c
}

const GRASS_VARIANTS = [0, 1, 2]
const SOIL_VARIANTS = [36, 37, 38, 39, 40, 41, 42]
const TREE_VARIANTS = [3, 4, 5, 27, 28, 29, 30, 31, 32, 33, 34, 35]
const PATH_TILE = 43
const FENCE_LEFT = 44
const FENCE_MID = 45
const FENCE_RIGHT = 46
const FENCE_POST = 47
const BLUE_ROOF = [48, 49, 50]
const ORANGE_ROOF = [52, 53, 54]
const BLUE_GABLE = 63
const ORANGE_GABLE = 67
const WOOD_WALL_LEFT = 72
const WOOD_WALL_MID = 73
const WOOD_WALL_RIGHT = 75
const STONE_WALL_LEFT = 76
const STONE_WALL_MID = 77
const STONE_WALL_RIGHT = 79
const WOOD_WINDOW = 84
const WOOD_DOOR = 85
const STONE_WINDOW = 88
const STONE_DOOR = 89
const CAMPFIRE_TILE = 94
const TARGET_TILE = 95
const WELL_TILE = 104
const CRATE_TILE = 106
const SIGN_TILE = 128
const ROPE_TILE = 129
const PLAYER_SPRITE = 'assets/kenney/roguelike-characters/singles/player-blue.png'
const VILLAGER_SPRITE = 'assets/kenney/roguelike-characters/singles/villager-brown.png'

function tinyTownTilePath(id: number): string {
  return `assets/kenney/tiny-town/tiles/tile_${id.toString().padStart(4, '0')}.png`
}

const PRELOAD_TILE_IDS = [
  ...GRASS_VARIANTS,
  ...SOIL_VARIANTS,
  ...TREE_VARIANTS,
  126,
  PATH_TILE,
  FENCE_LEFT,
  FENCE_MID,
  FENCE_RIGHT,
  FENCE_POST,
  ...BLUE_ROOF,
  ...ORANGE_ROOF,
  BLUE_GABLE,
  ORANGE_GABLE,
  WOOD_WALL_LEFT,
  WOOD_WALL_MID,
  WOOD_WALL_RIGHT,
  STONE_WALL_LEFT,
  STONE_WALL_MID,
  STONE_WALL_RIGHT,
  WOOD_WINDOW,
  WOOD_DOOR,
  STONE_WINDOW,
  STONE_DOOR,
  CAMPFIRE_TILE,
  TARGET_TILE,
  WELL_TILE,
  CRATE_TILE,
  SIGN_TILE,
  ROPE_TILE
]

const PRELOAD_ASSETS = [...PRELOAD_TILE_IDS.map(tinyTownTilePath), PLAYER_SPRITE, VILLAGER_SPRITE]

function pickVariant(ids: number[], x: number, y: number): string {
  const index = Math.abs((x * 31 + y * 17) % ids.length)
  return tinyTownTilePath(ids[index]!)
}

function addTileSprite(container: Container, assetPath: string, x: number, y: number, tileSize: number) {
  const sprite = Sprite.from(assetPath)
  sprite.x = x
  sprite.y = y
  sprite.width = tileSize
  sprite.height = tileSize
  sprite.roundPixels = true
  container.addChild(sprite)
  return sprite
}

function addPathIfNeeded(container: Container, tileX: number, tileY: number, localX: number, localY: number, tileSize: number, townCenter: WorldSave['world']['townCenter'], buildings: WorldSave['world']['buildings']) {
  if (shouldRenderPathTile(tileX, tileY, townCenter, buildings)) {
    addTileSprite(container, tinyTownTilePath(PATH_TILE), localX, localY, tileSize)
  }
}

function shouldRenderPathTile(
  tileX: number,
  tileY: number,
  townCenter: WorldSave['world']['townCenter'],
  buildings: WorldSave['world']['buildings']
) {
  const sameColumn = tileX === townCenter.x && Math.abs(tileY - townCenter.y) <= 8
  const sameRow = tileY === townCenter.y && Math.abs(tileX - townCenter.x) <= 8
  const nearBuilding = buildings.some(
    (building) =>
      Math.abs(building.position.x - tileX) <= 1 &&
      Math.abs(building.position.y - tileY) <= 1 &&
      building.complete
  )

  return sameColumn || sameRow || nearBuilding
}

type TilePlacement = {
  tileId: number
  dx: number
  dy: number
}

function getBuildingTilePlacements(kind: WorldSave['world']['buildings'][number]['kind']): TilePlacement[] {
  if (kind === 'campfire') {
    return [{ tileId: CAMPFIRE_TILE, dx: 1, dy: 2 }]
  }

  if (kind === 'storage') {
    return [
      { tileId: BLUE_ROOF[0], dx: 0, dy: 0 },
      { tileId: BLUE_GABLE, dx: 1, dy: 0 },
      { tileId: BLUE_ROOF[2], dx: 2, dy: 0 },
      { tileId: STONE_WALL_LEFT, dx: 0, dy: 1 },
      { tileId: STONE_WINDOW, dx: 1, dy: 1 },
      { tileId: STONE_WALL_RIGHT, dx: 2, dy: 1 },
      { tileId: STONE_WALL_LEFT, dx: 0, dy: 2 },
      { tileId: STONE_DOOR, dx: 1, dy: 2 },
      { tileId: STONE_WALL_RIGHT, dx: 2, dy: 2 },
      { tileId: CRATE_TILE, dx: 3, dy: 2 }
    ]
  }

  if (kind === 'hut') {
    return [
      { tileId: ORANGE_ROOF[0], dx: 0, dy: 0 },
      { tileId: ORANGE_GABLE, dx: 1, dy: 0 },
      { tileId: ORANGE_ROOF[2], dx: 2, dy: 0 },
      { tileId: WOOD_WALL_LEFT, dx: 0, dy: 1 },
      { tileId: WOOD_WINDOW, dx: 1, dy: 1 },
      { tileId: WOOD_WALL_RIGHT, dx: 2, dy: 1 },
      { tileId: WOOD_WALL_LEFT, dx: 0, dy: 2 },
      { tileId: WOOD_DOOR, dx: 1, dy: 2 },
      { tileId: WOOD_WALL_RIGHT, dx: 2, dy: 2 }
    ]
  }

  return [
    { tileId: BLUE_ROOF[0], dx: 0, dy: 0 },
    { tileId: BLUE_GABLE, dx: 1, dy: 0 },
    { tileId: BLUE_ROOF[2], dx: 2, dy: 0 },
    { tileId: STONE_WALL_LEFT, dx: 0, dy: 1 },
    { tileId: STONE_WINDOW, dx: 1, dy: 1 },
    { tileId: STONE_WALL_RIGHT, dx: 2, dy: 1 },
    { tileId: STONE_WALL_LEFT, dx: 0, dy: 2 },
    { tileId: STONE_DOOR, dx: 1, dy: 2 },
    { tileId: STONE_WALL_RIGHT, dx: 2, dy: 2 },
    { tileId: TARGET_TILE, dx: 3, dy: 0 },
    { tileId: WELL_TILE, dx: 3, dy: 2 },
    { tileId: SIGN_TILE, dx: -1, dy: 2 }
  ]
}

function renderBuildingSprite(
  container: Container,
  building: WorldSave['world']['buildings'][number],
  startX: number,
  startY: number,
  tileSize: number
) {
  const originX = (building.position.x - startX - 1) * tileSize
  const originY = (building.position.y - startY - 2) * tileSize
  getBuildingTilePlacements(building.kind).forEach(({ tileId, dx, dy }) => {
    addTileSprite(container, tinyTownTilePath(tileId), originX + dx * tileSize, originY + dy * tileSize, tileSize)
  })
}

function terrainAsset(tile: TerrainType, worldX: number, worldY: number): string | null {
  if (tile === 'grass' || tile === 'forest') return pickVariant(GRASS_VARIANTS, worldX, worldY)
  if (tile === 'soil') return pickVariant(SOIL_VARIANTS, worldX, worldY)
  if (tile === 'stone') return tinyTownTilePath(126)
  return null
}

export function PixiWorld({ save, compact, onMovePlayer, playerTarget }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [rendererMode, setRendererMode] = useState<'loading' | 'pixi' | 'fallback'>('loading')
  const viewStateRef = useRef({ startX: 0, startY: 0, tileSize: compact ? 12 : 18, visibleCols: 0, visibleRows: 0 })
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
        setRendererMode('loading')
        await Assets.load(PRELOAD_ASSETS)
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

  function handleMoveFromPointer(clientX: number, clientY: number) {
    if (!hostRef.current || !onMovePlayer) return
    const rect = hostRef.current.getBoundingClientRect()
    const relativeX = clientX - rect.left
    const relativeY = clientY - rect.top
    const { startX, startY, tileSize } = viewStateRef.current
    const tileX = Math.floor(relativeX / tileSize) + startX
    const tileY = Math.floor(relativeY / tileSize) + startY

    if (tileX < 0 || tileY < 0 || tileX >= save.world.width || tileY >= save.world.height) return
    onMovePlayer({ x: tileX, y: tileY })
  }

  const fallbackView = useMemo(() => {
    const tileSize = compact ? 12 : 18
    const visibleCols = compact ? 24 : 36
    const visibleRows = compact ? 18 : 24
    const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]
    const cameraCenter = compact ? admin.position : save.world.player.position
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
    const cameraCenter = compact ? admin.position : save.world.player.position
    const startX = Math.max(0, Math.min(save.world.width - visibleCols, cameraCenter.x - Math.floor(visibleCols / 2)))
    const startY = Math.max(0, Math.min(save.world.height - visibleRows, cameraCenter.y - Math.floor(visibleRows / 2)))
    viewStateRef.current = { startX, startY, tileSize, visibleCols, visibleRows }

    const background = new Graphics()
    background.rect(0, 0, viewWidth, viewHeight).fill(0x7bc96f)
    terrain.addChild(background)

    for (let y = 0; y < visibleRows; y += 1) {
      for (let x = 0; x < visibleCols; x += 1) {
        const worldX = startX + x
        const worldY = startY + y
        const tile = save.world.terrain[worldY]?.[worldX] ?? 'grass'
        const localX = x * tileSize
        const localY = y * tileSize
        const assetPath = terrainAsset(tile, worldX, worldY)

        if (assetPath) {
          addTileSprite(terrain, assetPath, localX, localY, tileSize)
        } else {
          const water = new Graphics()
          water.roundRect(localX, localY, tileSize, tileSize, 3).fill(TILE_COLORS[tile] ?? 0x1e293b)
          terrain.addChild(water)
        }

        addPathIfNeeded(terrain, worldX, worldY, localX, localY, tileSize, save.world.townCenter, save.world.buildings)
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
      if (resourceNode.kind === 'tree') {
        addTileSprite(resources, pickVariant(TREE_VARIANTS, resourceNode.position.x, resourceNode.position.y), localX, localY, tileSize)
      } else {
        addTileSprite(resources, tinyTownTilePath(126), localX, localY, tileSize)
      }
    })

    save.world.buildings.forEach((building) => {
      if (
        building.position.x < startX - 2 ||
        building.position.x >= startX + visibleCols + 2 ||
        building.position.y < startY - 3 ||
        building.position.y >= startY + visibleRows + 2
      ) {
        return
      }
      renderBuildingSprite(buildings, building, startX, startY, tileSize)
    })

    renderTownDecorations(buildings, save, startX, startY, tileSize)

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
      const shadow = new Graphics()
      shadow.ellipse(localX + tileSize / 2, localY + tileSize * 0.78, tileSize * 0.22, tileSize * 0.12).fill(0x020617, 0.35)
      agents.addChild(shadow)
      const sprite = addTileSprite(agents, VILLAGER_SPRITE, localX, localY, tileSize)
      sprite.y = localY - tileSize * 0.12
      if (agent.role === 'admin') {
        const halo = new Graphics()
        halo.circle(localX + tileSize / 2, localY + tileSize / 2, tileSize * 0.32).stroke({ color: 0xf8fafc, width: 2 })
        agents.addChild(halo)
      }
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

    if (
      save.world.player.position.x >= startX &&
      save.world.player.position.x < startX + visibleCols &&
      save.world.player.position.y >= startY &&
      save.world.player.position.y < startY + visibleRows
    ) {
      const localX = (save.world.player.position.x - startX) * tileSize
      const localY = (save.world.player.position.y - startY) * tileSize
      const halo = new Graphics()
      halo.circle(localX + tileSize / 2, localY + tileSize / 2, tileSize * 0.34).stroke({ color: 0xfacc15, width: 3 })
      agents.addChild(halo)
      const sprite = addTileSprite(agents, PLAYER_SPRITE, localX, localY, tileSize)
      sprite.y = localY - tileSize * 0.12
      if (!compact) {
        const playerLabel = new Text({
          text: 'P',
          style: {
            fill: '#1f2937',
            fontSize: Math.max(8, tileSize * 0.38),
            fontWeight: '700'
          }
        })
        playerLabel.x = localX + tileSize * 0.32
        playerLabel.y = localY + tileSize * 0.17
        agents.addChild(playerLabel)
      }
    }

    if (
      playerTarget &&
      playerTarget.x >= startX &&
      playerTarget.x < startX + visibleCols &&
      playerTarget.y >= startY &&
      playerTarget.y < startY + visibleRows
    ) {
      addTileSprite(
        agents,
        tinyTownTilePath(TARGET_TILE),
        (playerTarget.x - startX) * tileSize,
        (playerTarget.y - startY) * tileSize,
        tileSize
      )
    }

    const info = new Text({
      text: compact
        ? `Admin：${admin.currentTask}`
        : `${save.meta.name}｜库存 木:${save.world.stockpile.wood} 石:${save.world.stockpile.stone}｜玩家 ${save.world.player.position.x},${save.world.player.position.y}｜Agent:${save.world.agents.length}｜建筑:${save.world.buildings.length}`,
      style: {
        fill: '#e2e8f0',
        fontSize: compact ? 12 : 14,
        fontWeight: '600'
      }
    })
    info.x = 12
    info.y = 10
    info.eventMode = 'none'
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
      tip.eventMode = 'none'
      hud.addChild(tip)
    }
  }

  if (rendererMode === 'fallback') {
    return (
      <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl">
        <div className="absolute left-3 top-3 z-30 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
          Tiny Town 精灵渲染
        </div>
        <DomWorldFallback save={save} compact={compact} onMovePlayer={onMovePlayer} {...fallbackView} />
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl">
      {rendererMode === 'loading' ? (
        <div className="absolute left-3 top-3 z-30 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
          Pixi 资源加载中
        </div>
      ) : (
        <div className="absolute left-3 top-3 z-30 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          Pixi / Tiny Town 精灵渲染
        </div>
      )}
      <div
        ref={hostRef}
        className="h-full min-h-[320px] w-full overflow-hidden rounded-2xl"
        onClick={(event) => handleMoveFromPointer(event.clientX, event.clientY)}
      />
    </div>
  )
}

function renderTownDecorations(container: Container, save: WorldSave, startX: number, startY: number, tileSize: number) {
  const townX = save.world.townCenter.x - startX
  const townY = save.world.townCenter.y - startY

  const fenceSegments: Array<[number, number, number]> = [
    [townX - 4, townY + 4, FENCE_LEFT],
    [townX - 3, townY + 4, FENCE_MID],
    [townX - 2, townY + 4, FENCE_MID],
    [townX - 1, townY + 4, FENCE_RIGHT],
    [townX + 2, townY - 2, FENCE_LEFT],
    [townX + 3, townY - 2, FENCE_MID],
    [townX + 4, townY - 2, FENCE_RIGHT],
    [townX - 4, townY - 3, FENCE_POST],
    [townX + 5, townY + 3, ROPE_TILE]
  ]

  fenceSegments.forEach(([x, y, tileId]) => {
    if (x < -2 || y < -2) return
    addTileSprite(container, tinyTownTilePath(tileId), x * tileSize, y * tileSize, tileSize)
  })
}

function getTownDecorationPlacements(save: WorldSave, startX: number, startY: number): TilePlacement[] {
  const townX = save.world.townCenter.x - startX
  const townY = save.world.townCenter.y - startY
  return [
    { tileId: FENCE_LEFT, dx: townX - 4, dy: townY + 4 },
    { tileId: FENCE_MID, dx: townX - 3, dy: townY + 4 },
    { tileId: FENCE_MID, dx: townX - 2, dy: townY + 4 },
    { tileId: FENCE_RIGHT, dx: townX - 1, dy: townY + 4 },
    { tileId: FENCE_LEFT, dx: townX + 2, dy: townY - 2 },
    { tileId: FENCE_MID, dx: townX + 3, dy: townY - 2 },
    { tileId: FENCE_RIGHT, dx: townX + 4, dy: townY - 2 },
    { tileId: FENCE_POST, dx: townX - 4, dy: townY - 3 },
    { tileId: ROPE_TILE, dx: townX + 5, dy: townY + 3 }
  ]
}

function DomWorldFallback({
  save,
  compact,
  onMovePlayer,
  playerTarget,
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
  const renderedBuildings = save.world.buildings.flatMap((building) => {
    if (
      building.position.x < startX - 2 ||
      building.position.x >= startX + visibleCols + 2 ||
      building.position.y < startY - 3 ||
      building.position.y >= startY + visibleRows + 2
    ) {
      return []
    }

    const originX = building.position.x - startX - 1
    const originY = building.position.y - startY - 2
    return getBuildingTilePlacements(building.kind).map(({ tileId, dx, dy }) => ({
      key: `${building.id}-${tileId}-${dx}-${dy}`,
      tileId,
      x: originX + dx,
      y: originY + dy
    }))
  })

  const decorTiles = getTownDecorationPlacements(save, startX, startY)

  return (
    <div
      className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#081225]"
      onClick={(event) => {
        if (!onMovePlayer) return
        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
        const tileX = Math.floor((event.clientX - rect.left) / tileSize) + startX
        const tileY = Math.floor((event.clientY - rect.top) / tileSize) + startY
        if (tileX < 0 || tileY < 0 || tileX >= save.world.width || tileY >= save.world.height) return
        onMovePlayer({ x: tileX, y: tileY })
      }}
    >
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
            const worldX = startX + x
            const worldY = startY + y
            const tile = save.world.terrain[worldY]?.[worldX] ?? 'grass'
            const assetPath = terrainAsset(tile, worldX, worldY)
            return (
              <div
                key={`${worldX}-${worldY}`}
                style={{
                  width: tileSize,
                  height: tileSize,
                  position: 'relative',
                  background: assetPath ? 'transparent' : `#${(TILE_COLORS[tile] ?? 0x1e293b).toString(16).padStart(6, '0')}`
                }}
              >
                {assetPath ? <img src={assetPath} alt="" className="pixelated h-full w-full" draggable={false} /> : null}
                {shouldRenderPathTile(worldX, worldY, save.world.townCenter, save.world.buildings) ? (
                  <img src={tinyTownTilePath(PATH_TILE)} alt="" className="pixelated absolute inset-0 h-full w-full" draggable={false} />
                ) : null}
              </div>
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
          <img
            key={resourceNode.id}
            src={resourceNode.kind === 'tree' ? pickVariant(TREE_VARIANTS, resourceNode.position.x, resourceNode.position.y) : tinyTownTilePath(126)}
            alt=""
            className="absolute pixelated"
            style={{
              left,
              top,
              width: tileSize,
              height: tileSize
            }}
          />
        )
      })}

      {renderedBuildings.map((tile) => (
        <img
          key={tile.key}
          src={tinyTownTilePath(tile.tileId)}
          alt=""
          className="absolute pixelated"
          style={{
            left: tile.x * tileSize,
            top: tile.y * tileSize,
            width: tileSize,
            height: tileSize
          }}
        />
      ))}

      {decorTiles.map((tile, index) =>
        tile.dx < -2 || tile.dy < -2 ? null : (
          <img
            key={`decor-${index}-${tile.tileId}`}
            src={tinyTownTilePath(tile.tileId)}
            alt=""
            className="absolute pixelated"
            style={{
              left: tile.dx * tileSize,
              top: tile.dy * tileSize,
              width: tileSize,
              height: tileSize
            }}
          />
        )
      )}

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
          <div key={agent.id}>
            {agent.role === 'admin' ? (
              <div
                className="absolute rounded-full"
                style={{
                  left: left + tileSize * 0.08,
                  top: top + tileSize * 0.08,
                  width: tileSize * 0.84,
                  height: tileSize * 0.84,
                  border: '2px solid #f8fafc'
                }}
              />
            ) : null}
            <img
              src={VILLAGER_SPRITE}
              alt={agent.name}
              className="absolute pixelated sprite-bob"
              style={{
                left,
                top: top - tileSize * 0.12,
                width: tileSize,
                height: tileSize
              }}
            />
          </div>
        )
      })}

      {save.world.player.position.x >= startX &&
      save.world.player.position.x < startX + visibleCols &&
      save.world.player.position.y >= startY &&
      save.world.player.position.y < startY + visibleRows ? (
        <div>
          <div
            className="absolute rounded-full"
            style={{
              left: (save.world.player.position.x - startX) * tileSize + tileSize * 0.08,
              top: (save.world.player.position.y - startY) * tileSize + tileSize * 0.08,
              width: tileSize * 0.84,
              height: tileSize * 0.84,
              border: '2px solid #facc15'
            }}
          />
          <img
            src={PLAYER_SPRITE}
            alt={save.world.player.name}
            className="absolute pixelated sprite-bob"
            style={{
              left: (save.world.player.position.x - startX) * tileSize,
              top: (save.world.player.position.y - startY) * tileSize - tileSize * 0.12,
              width: tileSize,
              height: tileSize
            }}
          />
        </div>
      ) : null}

      {playerTarget &&
      playerTarget.x >= startX &&
      playerTarget.x < startX + visibleCols &&
      playerTarget.y >= startY &&
      playerTarget.y < startY + visibleRows ? (
        <img
          src={tinyTownTilePath(TARGET_TILE)}
          alt="player target"
          className="absolute pixelated"
          style={{
            left: (playerTarget.x - startX) * tileSize,
            top: (playerTarget.y - startY) * tileSize,
            width: tileSize,
            height: tileSize
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute left-3 right-3 top-10 z-20 rounded-2xl bg-slate-950/55 px-3 py-2 text-xs text-slate-100">
        {compact
          ? `Admin：${admin.currentTask}`
          : `${save.meta.name}｜库存 木:${save.world.stockpile.wood} 石:${save.world.stockpile.stone}｜玩家 ${save.world.player.position.x},${save.world.player.position.y}`}
      </div>
    </div>
  )
}
