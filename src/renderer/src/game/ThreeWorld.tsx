import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents, Html, Sky } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { AgentState, TerrainType, WorldSave } from '@shared/contracts'
import { BUILD_TICKS_REQUIRED, HARVEST_TICKS_REQUIRED } from '@shared/game'
import { applyCharacterAnimation, createLowPolyCharacter, type CharacterRig } from './lowpolyCharacter'
import {
  createBuildingModule,
  createCarpet,
  createCrateStack,
  createInstancedFenceScatter,
  createInstancedRockScatter,
  createInstancedTreeScatter,
  createLogPile,
  createPlant,
  createSignpost,
  createWallSegment
} from './lowpolyScene'

type Props = {
  save: WorldSave
  compact: boolean
  onMovePlayer?: (position: { x: number; y: number }) => void
  playerTarget?: { x: number; y: number } | null
  observeAgentId?: string | null
  observeCameraOffset?: { x: number; y: number }
  fallback: ReactNode
}

type ActorSource = WorldSave['world']['player'] | AgentState

const TERRAIN_TOP_COLORS: Record<TerrainType, number> = {
  grass: 0xa8ce8e,
  forest: 0x90b97a,
  water: 0x92c8df,
  stone: 0xb8b3a3,
  soil: 0xc8a97b
}

const TERRAIN_TOP_MATERIALS: Record<TerrainType, THREE.MeshStandardMaterial> = {
  grass: new THREE.MeshStandardMaterial({ color: TERRAIN_TOP_COLORS.grass, roughness: 0.92 }),
  forest: new THREE.MeshStandardMaterial({ color: TERRAIN_TOP_COLORS.forest, roughness: 0.92 }),
  water: new THREE.MeshStandardMaterial({ color: TERRAIN_TOP_COLORS.water, roughness: 0.28, metalness: 0.04 }),
  stone: new THREE.MeshStandardMaterial({ color: TERRAIN_TOP_COLORS.stone, roughness: 0.96 }),
  soil: new THREE.MeshStandardMaterial({ color: TERRAIN_TOP_COLORS.soil, roughness: 0.94 })
}

const TERRAIN_SHARED_WATER_GEOMETRY = new THREE.PlaneGeometry(1.02, 1.02).rotateX(-Math.PI / 2)
const COMPACT_CAMERA_OFFSET = new THREE.Vector3(12.8, 17.2, 11.4)
const FULL_CAMERA_OFFSET = new THREE.Vector3(20.5, 27.5, 18.6)

Object.values(TERRAIN_TOP_MATERIALS).forEach((material) => {
  material.userData.shared = true
})
TERRAIN_SHARED_WATER_GEOMETRY.userData.shared = true

function withinView(position: { x: number; y: number }, center: { x: number; y: number }, cols: number, rows: number) {
  return Math.abs(position.x - center.x) <= Math.floor(cols / 2) + 3 && Math.abs(position.y - center.y) <= Math.floor(rows / 2) + 3
}

function getTerrainTypeAt(world: WorldSave['world'], x: number, y: number): TerrainType {
  const sx = Math.max(0, Math.min(world.width - 1, Math.round(x)))
  const sy = Math.max(0, Math.min(world.height - 1, Math.round(y)))
  return world.terrain[sy]?.[sx] ?? 'grass'
}

function getTerrainHeightAt(world: WorldSave['world'], x: number, y: number, type = getTerrainTypeAt(world, x, y)) {
  const waveA = Math.sin(x * 0.23 + world.seed * 0.0013) * 0.08
  const waveB = Math.cos(y * 0.19 - world.seed * 0.0017) * 0.06
  const ridge = Math.sin((x + y) * 0.11) * 0.03
  const typeLift = type === 'stone' ? 0.1 : type === 'forest' ? 0.05 : type === 'soil' ? -0.015 : type === 'water' ? -0.16 : 0
  const naturalHeight = waveA + waveB + ridge + typeLift
  const distanceToTown = Math.hypot(x - world.townCenter.x, y - world.townCenter.y)
  const flattenBlend = THREE.MathUtils.clamp(1 - distanceToTown / 10.5, 0, 1)
  return THREE.MathUtils.lerp(naturalHeight, 0, flattenBlend * 0.92)
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => disposeMaterial(item))
    return
  }
  if (material.userData?.shared) return
  material.dispose()
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (!child.geometry.userData?.shared) {
        child.geometry.dispose()
      }
      disposeMaterial(child.material)
    }
  })
}

function createAdminRing() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.04, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xf2cf74, emissive: 0x8b6914, emissiveIntensity: 0.35 })
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.04
  return ring
}

function createGroundMarker(color: number) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.06, 8, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12 })
  )
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 0.05
  return mesh
}

function createWorldBackdrop(world: WorldSave['world']) {
  const radius = Math.max(world.width, world.height) * 1.6
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshStandardMaterial({ color: 0xa8d58d, roughness: 1 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(world.width / 2, -0.05, world.height / 2)
  ground.receiveShadow = true
  return ground
}

function addPathPatch(group: THREE.Group, x: number, z: number, width: number, depth: number, color = 0xc8a67b) {
  const patch = createCarpet(color, width, depth)
  patch.position.set(x, 0.02, z)
  group.add(patch)
}

function buildTerrainGroup(world: WorldSave['world'], center: { x: number; y: number }, visibleCols: number, visibleRows: number) {
  const terrainLayer = new THREE.Group()
  const minX = Math.max(0, center.x - Math.floor(visibleCols / 2) - 4)
  const maxX = Math.min(world.width - 1, center.x + Math.floor(visibleCols / 2) + 4)
  const minY = Math.max(0, center.y - Math.floor(visibleRows / 2) - 4)
  const maxY = Math.min(world.height - 1, center.y + Math.floor(visibleRows / 2) + 4)
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1

  const geometry = new THREE.PlaneGeometry(cols, rows, cols, rows).rotateX(-Math.PI / 2)
  const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const colorAttr = new Float32Array(positionAttr.count * 3)

  for (let index = 0; index < positionAttr.count; index += 1) {
    const localX = positionAttr.getX(index)
    const localZ = positionAttr.getZ(index)
    const worldX = minX + localX + cols / 2
    const worldY = minY + localZ + rows / 2
    const type = getTerrainTypeAt(world, worldX, worldY)
    positionAttr.setY(index, getTerrainHeightAt(world, worldX, worldY, type))
    const color = new THREE.Color(TERRAIN_TOP_COLORS[type])
    colorAttr[index * 3] = color.r
    colorAttr[index * 3 + 1] = color.g
    colorAttr[index * 3 + 2] = color.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3))
  geometry.computeVertexNormals()
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.02
  })
  const terrainMesh = new THREE.Mesh(geometry, terrainMaterial)
  terrainMesh.position.set((minX + maxX) / 2, 0.02, (minY + maxY) / 2)
  terrainMesh.receiveShadow = true
  terrainMesh.castShadow = false
  terrainLayer.add(terrainMesh)

  const waterTiles: Array<{ x: number; y: number }> = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((world.terrain[y]?.[x] ?? 'grass') === 'water') {
        waterTiles.push({ x, y })
      }
    }
  }

  if (waterTiles.length > 0) {
    const waterMesh = new THREE.InstancedMesh(TERRAIN_SHARED_WATER_GEOMETRY, TERRAIN_TOP_MATERIALS.water, waterTiles.length)
    const matrix = new THREE.Matrix4()
    waterTiles.forEach((tile, index) => {
      matrix.makeTranslation(tile.x, getTerrainHeightAt(world, tile.x, tile.y, 'water') + 0.03, tile.y)
      waterMesh.setMatrixAt(index, matrix)
    })
    waterMesh.instanceMatrix.needsUpdate = true
    waterMesh.receiveShadow = false
    terrainLayer.add(waterMesh)
  }

  return terrainLayer
}

function buildTownArchitectureGroup(save: WorldSave, center: { x: number; y: number }, visibleCols: number, visibleRows: number) {
  const architecture = new THREE.Group()
  const cx = save.world.townCenter.x
  const cy = save.world.townCenter.y

  addPathPatch(architecture, cx, cy, 4.6, 3.6, 0xd3b48d)
  addPathPatch(architecture, cx, cy - 3.15, 1.05, 2.9)
  addPathPatch(architecture, cx, cy + 3.15, 1.05, 2.9)
  addPathPatch(architecture, cx - 3.9, cy, 3.3, 1.05)
  addPathPatch(architecture, cx + 3.9, cy, 3.3, 1.05)

  for (const building of save.world.buildings) {
    const bx = building.position.x
    const bz = building.position.y
    const dx = bx - cx
    const dz = bz - cy
    if (Math.abs(dx) > Math.abs(dz)) {
      addPathPatch(architecture, cx + dx / 2, cy, Math.abs(dx) + 1.1, 0.82)
      addPathPatch(architecture, bx, cy + dz / 2, 0.82, Math.abs(dz) + 1.1)
    } else {
      addPathPatch(architecture, cx, cy + dz / 2, 0.82, Math.abs(dz) + 1.1)
      addPathPatch(architecture, cx + dx / 2, bz, Math.abs(dx) + 1.1, 0.82)
    }
  }

  const retaining = createWallSegment(2.2, 0.48, 0.28)
  retaining.position.set(cx + 4.9, 0, cy + 4.8)
  retaining.rotation.y = 0.3
  architecture.add(retaining)

  for (const building of save.world.buildings) {
    if (!withinView(building.position, center, visibleCols, visibleRows)) continue
    const module = createBuildingModule(building.kind)
    module.position.set(
      building.position.x,
      getTerrainHeightAt(save.world, building.position.x, building.position.y),
      building.position.y
    )
    module.rotation.y = building.rotation * (Math.PI / 2)
    architecture.add(module)
  }

  return architecture
}

function buildTownPropsGroup(save: WorldSave, center: { x: number; y: number }, visibleCols: number, visibleRows: number) {
  const props = new THREE.Group()
  const cx = save.world.townCenter.x
  const cy = save.world.townCenter.y

  const stagingLog = createLogPile()
  stagingLog.position.set(cx - 2.6, 0, cy - 1.8)
  props.add(stagingLog)

  const stagingCrates = createCrateStack()
  stagingCrates.position.set(cx + 2.5, 0, cy - 1.6)
  props.add(stagingCrates)

  const sign = createSignpost()
  sign.position.set(cx + 0.9, 0, cy + 2.2)
  props.add(sign)

  const fenceSegments = [
    { x: cx - 6.2, z: cy - 4.6, rotate: 0 },
    { x: cx - 4.8, z: cy - 4.6, rotate: 0 },
    { x: cx - 3.4, z: cy - 4.6, rotate: 0 },
    { x: cx + 3.4, z: cy - 4.6, rotate: 0 },
    { x: cx + 4.8, z: cy - 4.6, rotate: 0 },
    { x: cx + 6.2, z: cy - 4.6, rotate: 0 },
    { x: cx - 6.2, z: cy + 4.6, rotate: 0 },
    { x: cx - 4.8, z: cy + 4.6, rotate: 0 },
    { x: cx - 3.4, z: cy + 4.6, rotate: 0 },
    { x: cx + 3.4, z: cy + 4.6, rotate: 0 },
    { x: cx + 4.8, z: cy + 4.6, rotate: 0 },
    { x: cx + 6.2, z: cy + 4.6, rotate: 0 },
    { x: cx - 7, z: cy - 3.2, rotate: Math.PI / 2 },
    { x: cx - 7, z: cy - 1.8, rotate: Math.PI / 2 },
    { x: cx - 7, z: cy - 0.4, rotate: Math.PI / 2 },
    { x: cx - 7, z: cy + 1, rotate: Math.PI / 2 },
    { x: cx - 7, z: cy + 2.4, rotate: Math.PI / 2 },
    { x: cx - 7, z: cy + 3.8, rotate: Math.PI / 2 },
    { x: cx + 7, z: cy - 3.2, rotate: Math.PI / 2 },
    { x: cx + 7, z: cy - 1.8, rotate: Math.PI / 2 },
    { x: cx + 7, z: cy - 0.4, rotate: Math.PI / 2 },
    { x: cx + 7, z: cy + 1, rotate: Math.PI / 2 },
    { x: cx + 7, z: cy + 2.4, rotate: Math.PI / 2 },
    { x: cx + 7, z: cy + 3.8, rotate: Math.PI / 2 }
  ]
  props.add(
    createInstancedFenceScatter(
      fenceSegments.map((segment) => ({
        x: segment.x,
        y: getTerrainHeightAt(save.world, segment.x, segment.z),
        z: segment.z,
        rotationY: segment.rotate
      }))
    )
  )

  ;[
    [cx - 6.6, cy - 5.2],
    [cx - 5.2, cy + 5.2],
    [cx + 5.5, cy - 5.1],
    [cx + 6.5, cy + 5.1],
    [cx - 2.4, cy + 5.4],
    [cx + 2.2, cy - 5.5]
  ].forEach(([x, z], index) => {
    const plant = createPlant()
    plant.position.set(x, getTerrainHeightAt(save.world, x, z), z)
    plant.rotation.y = index * 0.8
    props.add(plant)
  })

  const decorativeTrees = [
    [cx - 8.5, cy - 6.6],
    [cx - 8.4, cy + 6.4],
    [cx + 8.4, cy - 6.2],
    [cx + 8.2, cy + 6.4],
    [cx, cy - 7.2],
    [cx, cy + 7.1]
  ]
  props.add(
    createInstancedTreeScatter(
      decorativeTrees.map(([x, z], index) => ({
        x,
        y: getTerrainHeightAt(save.world, x, z),
        z,
        rotationY: index * 0.78,
        scale: 1 + (index % 3) * 0.08
      }))
    )
  )

  props.add(
    createInstancedRockScatter([
      { x: cx - 5.4, y: getTerrainHeightAt(save.world, cx - 5.4, cy + 1.9), z: cy + 1.9, rotationY: 0.25, scale: 1.1 },
      { x: cx + 5.1, y: getTerrainHeightAt(save.world, cx + 5.1, cy - 2.2), z: cy - 2.2, rotationY: -0.5, scale: 0.95 }
    ])
  )

  const treeNodes: Array<{ x: number; y: number; z: number; rotationY: number; scale: number }> = []
  const rockNodes: Array<{ x: number; y: number; z: number; rotationY: number; scale: number }> = []
  for (const node of save.world.resources) {
    if (!withinView(node.position, center, visibleCols, visibleRows)) continue
    if (node.kind === 'tree') {
      treeNodes.push({
        x: node.position.x,
        y: getTerrainHeightAt(save.world, node.position.x, node.position.y),
        z: node.position.y,
        rotationY: (node.position.x * 0.21 + node.position.y * 0.13) % (Math.PI * 2),
        scale: 0.94 + ((node.position.x + node.position.y) % 4) * 0.06
      })
    } else {
      rockNodes.push({
        x: node.position.x,
        y: getTerrainHeightAt(save.world, node.position.x, node.position.y),
        z: node.position.y,
        rotationY: (node.position.x * 0.17 - node.position.y * 0.11) % (Math.PI * 2),
        scale: 0.88 + ((node.position.x + node.position.y) % 3) * 0.08
      })
    }
  }
  props.add(createInstancedTreeScatter(treeNodes))
  props.add(createInstancedRockScatter(rockNodes))

  return props
}

function useDisposableObject<T extends THREE.Object3D>(factory: () => T, deps: readonly unknown[]) {
  const object = useMemo(factory, deps)
  useEffect(() => () => disposeObject(object), [object])
  return object
}

function RendererTuning({ compact }: { compact: boolean }) {
  const { gl } = useThree()

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = compact ? 1.04 : 1.1
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
  }, [compact, gl])

  return null
}

function CameraRig({ target, compact }: { target: { x: number; y: number }; compact: boolean }) {
  const { camera } = useThree()
  const targetRef = useRef(new THREE.Vector3())
  const desiredRef = useRef(new THREE.Vector3())

  useFrame(() => {
    targetRef.current.set(target.x + (compact ? 0.4 : 0), 0.92, target.y)
    desiredRef.current.copy(targetRef.current).add(compact ? COMPACT_CAMERA_OFFSET : FULL_CAMERA_OFFSET)
    camera.position.lerp(desiredRef.current, 0.08)
    camera.lookAt(targetRef.current.x, 0.2, targetRef.current.z + 0.8)
  })

  return null
}

function getAgentStorySnippet(agent: AgentState) {
  const latestMemory = agent.memories.at(-1)?.content?.trim()
  if (latestMemory) {
    return latestMemory.length > 24 ? `${latestMemory.slice(0, 24)}...` : latestMemory
  }
  return agent.plan.length > 24 ? `${agent.plan.slice(0, 24)}...` : agent.plan
}

function getAgentActivity(agent: AgentState): 'chop' | 'mine' | 'build' | null {
  if (agent.currentTask === '砍树') return 'chop'
  if (agent.currentTask === '采石') return 'mine'
  if (agent.currentTask === '建造') return 'build'
  return null
}

function getAgentTaskProgress(agent: AgentState) {
  const total = agent.currentTask === '建造' ? BUILD_TICKS_REQUIRED : agent.currentTask === '砍树' || agent.currentTask === '采石' ? HARVEST_TICKS_REQUIRED : 0
  if (total === 0) return null
  const clamped = Math.max(0, Math.min(1, agent.actionTicks / total))
  return {
    label: `${Math.round(clamped * 100)}%`,
    ratio: clamped
  }
}

function ActorPrimitive(props: {
  source: ActorSource
  world: WorldSave['world']
  isPlayer: boolean
  isAdmin: boolean
  bobOffset: number
  bodyColor: number
  accentColor: number
}) {
  const { source, world, isPlayer, isAdmin, bobOffset, bodyColor, accentColor } = props
  const rootGroupRef = useRef<THREE.Group | null>(null)
  const rig = useMemo(() => {
    const created = createLowPolyCharacter({
      bodyColor,
      accentColor,
      isAdmin
    })
    if (isAdmin) {
      created.root.add(createAdminRing())
    }
    if (isPlayer) {
      created.root.add(createGroundMarker(0x5fc4ef))
    }
    return created
  }, [accentColor, bodyColor, isAdmin, isPlayer])

  useEffect(() => () => disposeObject(rig.root), [rig])

  useFrame((state) => {
    const mood = isPlayer ? 'stable' : (source as AgentState).mood
    const groundY = getTerrainHeightAt(world, source.renderPosition.x, source.renderPosition.y)
    rootGroupRef.current?.position.set(source.renderPosition.x, groundY, source.renderPosition.y)
    const activity = !isPlayer ? getAgentActivity(source as AgentState) : null
    const progress = !isPlayer ? getAgentTaskProgress(source as AgentState)?.ratio ?? 0 : 0
    applyCharacterAnimation(rig, state.clock.elapsedTime, source.animState, source.facing, mood, bobOffset, 0, activity, progress)
  })

  const agentSource = !isPlayer ? (source as AgentState) : null
  const taskProgress = agentSource ? getAgentTaskProgress(agentSource) : null
  const label = agentSource ? (
    <Html
      position={[0, 2.18, 0]}
      center
      distanceFactor={18}
      style={{ pointerEvents: 'none' }}
      transform={false}
      zIndexRange={[10, 0]}
    >
      <div className="flex min-w-[5.5rem] max-w-[10rem] flex-col items-center gap-1 text-center">
        <div className="rounded-full border border-white/20 bg-slate-950/72 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-lg backdrop-blur-sm">
          {agentSource.name}
        </div>
        <div className="rounded-2xl border border-emerald-200/20 bg-slate-950/68 px-2.5 py-1.5 text-[10px] leading-snug text-emerald-50 shadow-lg backdrop-blur-sm">
          <div className="font-semibold text-emerald-200">{agentSource.currentTask}</div>
          <div className="mt-0.5 text-[10px] text-white/88">{getAgentStorySnippet(agentSource)}</div>
          {taskProgress ? (
            <div className="mt-1.5">
              <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-widest text-emerald-200/80">
                <span>进度</span>
                <span>{taskProgress.label}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-300 transition-[width]" style={{ width: `${taskProgress.ratio * 100}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Html>
  ) : null

  return (
    <group ref={rootGroupRef}>
      <primitive object={rig.root} />
      {label}
    </group>
  )
}

function TargetMarker({ world, target }: { world: WorldSave['world']; target: { x: number; y: number } }) {
  const marker = useDisposableObject(() => {
    const next = createGroundMarker(0xffd54f)
    next.position.set(target.x, getTerrainHeightAt(world, target.x, target.y) + 0.06, target.y)
    return next
  }, [target.x, target.y, world.seed, world.width, world.height])

  return <primitive object={marker} />
}

function WorldScene({ save, compact, onMovePlayer, playerTarget, observeAgentId, observeCameraOffset }: Omit<Props, 'fallback'>) {
  const admin = useMemo(() => save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0], [save.world.agents])
  const observeTarget = useMemo(
    () => save.world.agents.find((agent) => agent.id === observeAgentId) ?? admin,
    [admin, observeAgentId, save.world.agents]
  )
  const focusCenter = useMemo(
    () => ({
      x: Math.round(
        compact || save.settings.playerControlMode === 'observe' ? observeTarget.renderPosition.x : save.world.player.renderPosition.x
      ),
      y: Math.round(
        compact || save.settings.playerControlMode === 'observe' ? observeTarget.renderPosition.y : save.world.player.renderPosition.y
      )
    }),
    [compact, observeTarget.renderPosition, save.settings.playerControlMode, save.world.player.renderPosition]
  )
  const cameraCenter = useMemo(
    () => ({
      x:
        (compact || save.settings.playerControlMode === 'observe' ? observeTarget.renderPosition.x : save.world.player.renderPosition.x) +
        (observeCameraOffset?.x ?? 0),
      y:
        (compact || save.settings.playerControlMode === 'observe' ? observeTarget.renderPosition.y : save.world.player.renderPosition.y) +
        (observeCameraOffset?.y ?? 0)
    }),
    [compact, observeCameraOffset?.x, observeCameraOffset?.y, observeTarget.renderPosition, save.settings.playerControlMode, save.world.player.renderPosition]
  )

  const visibleCols = compact ? 34 : 52
  const visibleRows = compact ? 24 : 38
  const terrainWindowKey = `${compact}:${focusCenter.x}:${focusCenter.y}`
  const focusCenterSignature = `${focusCenter.x}:${focusCenter.y}:${compact}`
  const buildingSignature = useMemo(
    () => save.world.buildings.map((building) => `${building.id}:${building.kind}:${building.rotation}:${building.position.x},${building.position.y}`).join('|'),
    [save.world.buildings]
  )
  const resourceSignature = useMemo(
    () => save.world.resources.map((resource) => `${resource.id}:${resource.kind}:${resource.amount}:${resource.position.x},${resource.position.y}`).join('|'),
    [save.world.resources]
  )
  const actorLayoutSignature = useMemo(
    () =>
      `${save.settings.playerControlMode}|${save.world.player.position.x},${save.world.player.position.y}|${save.world.agents
        .map((agent) => `${agent.id}:${agent.role}:${agent.position.x},${agent.position.y}`)
        .join('|')}`,
    [save.settings.playerControlMode, save.world.agents, save.world.player.position]
  )

  const terrainObject = useDisposableObject(
    () => buildTerrainGroup(save.world, focusCenter, visibleCols, visibleRows),
    [save.world.seed, save.world.width, save.world.height, terrainWindowKey, visibleCols, visibleRows]
  )
  const backdropObject = useDisposableObject(
    () => createWorldBackdrop(save.world),
    [save.world.width, save.world.height]
  )
  const architectureObject = useDisposableObject(
    () => buildTownArchitectureGroup(save, focusCenter, visibleCols, visibleRows),
    [buildingSignature, focusCenterSignature, save.world.seed, visibleCols, visibleRows]
  )
  const propsObject = useDisposableObject(
    () => buildTownPropsGroup(save, focusCenter, visibleCols, visibleRows),
    [focusCenterSignature, resourceSignature, save.world.seed, visibleCols, visibleRows]
  )

  const visibleAgents = useMemo(
    () => save.world.agents.filter((agent) => withinView(agent.position, focusCenter, visibleCols, visibleRows)),
    [actorLayoutSignature, focusCenterSignature, save.world.agents, visibleCols, visibleRows]
  )

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!onMovePlayer || save.settings.playerControlMode === 'observe') return
      const worldX = Math.round(event.point.x)
      const worldY = Math.round(event.point.z)
      if (worldX < 0 || worldY < 0 || worldX >= save.world.width || worldY >= save.world.height) return
      onMovePlayer({ x: worldX, y: worldY })
    },
    [onMovePlayer, save.settings.playerControlMode, save.world.height, save.world.width]
  )

  return (
    <>
      <RendererTuning compact={compact} />
      <color attach="background" args={['#cdefff']} />
      <fog attach="fog" args={['#dff5da', 62, 138]} />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <Sky distance={450000} sunPosition={[18, 12, 8]} turbidity={7} rayleigh={1.6} mieCoefficient={0.003} mieDirectionalG={0.82} />
      <ambientLight color="#fffcf2" intensity={0.72} />
      <hemisphereLight args={['#cff3ff', '#93bf7c', 0.88]} />
      <directionalLight
        castShadow
        position={[24, 36, 20]}
        intensity={2.45}
        color="#ffefbf"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.00003}
        shadow-normalBias={0.006}
      />
      <directionalLight position={[-18, 24, -12]} intensity={0.38} color="#fff2dd" />
      <directionalLight position={[6, 14, -18]} intensity={0.18} color="#f6ffe6" />
      <CameraRig target={cameraCenter} compact={compact} />

      <group onPointerDown={handlePointerDown}>
        <primitive object={backdropObject} />
        <primitive object={terrainObject} />
        <primitive object={architectureObject} />
        <primitive object={propsObject} />
        {visibleAgents.map((agent, index) => (
          <ActorPrimitive
            key={agent.id}
            source={agent}
            world={save.world}
            isPlayer={false}
            isAdmin={agent.role === 'admin'}
            bobOffset={index * 0.7}
            bodyColor={agent.role === 'admin' ? 0x4ab9e9 : 0x7f98d2}
            accentColor={agent.role === 'admin' ? 0xffd54f : 0x2e3645}
          />
        ))}
        {save.settings.playerControlMode === 'control' && withinView(save.world.player.position, focusCenter, visibleCols, visibleRows) ? (
          <ActorPrimitive
            key="player"
            source={save.world.player}
            world={save.world}
            isPlayer
            isAdmin={false}
            bobOffset={0.4}
            bodyColor={0x5fc4ef}
            accentColor={0x173347}
          />
        ) : null}
        {playerTarget ? <TargetMarker world={save.world} target={playerTarget} /> : null}
      </group>

      <EffectComposer enableNormalPass={false} multisampling={compact ? 0 : 4}>
        <Bloom mipmapBlur intensity={compact ? 0.18 : 0.28} luminanceThreshold={0.76} />
        <Noise opacity={compact ? 0.01 : 0.014} premultiply />
        <Vignette eskil={false} offset={0.16} darkness={0.18} />
      </EffectComposer>
    </>
  )
}

function createSceneOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 34%, rgba(74,128,86,0.04) 66%, rgba(8,18,16,0.14) 100%)'
      }}
    />
  )
}

export function ThreeWorld({ save, compact, onMovePlayer, playerTarget, observeAgentId, observeCameraOffset, fallback }: Props) {
  const [ready, setReady] = useState(false)

  if (typeof window !== 'undefined' && !('WebGLRenderingContext' in window)) {
    return <>{fallback}</>
  }

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl">
      {createSceneOverlay()}
      <Canvas
        className="h-full w-full"
        shadows
        dpr={[0.9, 1.25]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 180, position: [20.5, 27.5, 18.6] }}
        onCreated={() => setReady(true)}
      >
        <WorldScene
          save={save}
          compact={compact}
          onMovePlayer={onMovePlayer}
          playerTarget={playerTarget}
          observeAgentId={observeAgentId}
          observeCameraOffset={observeCameraOffset}
        />
      </Canvas>
      {!ready ? (
        <div className="absolute left-3 top-3 z-30 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
          加载 3D 世界...
        </div>
      ) : null}
    </div>
  )
}
