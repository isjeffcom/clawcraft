import * as THREE from 'three'
import type { BuildingKind, TerrainType } from '@shared/contracts'

const TERRAIN_BASE_COLORS: Record<TerrainType, number> = {
  grass: 0x93b97b,
  forest: 0x7da06a,
  water: 0x76aeca,
  stone: 0xa4a190,
  soil: 0xb89568
}

const TERRAIN_BASE_MATERIALS: Record<TerrainType, THREE.MeshStandardMaterial> = {
  grass: new THREE.MeshStandardMaterial({ color: TERRAIN_BASE_COLORS.grass, roughness: 0.98 }),
  forest: new THREE.MeshStandardMaterial({ color: TERRAIN_BASE_COLORS.forest, roughness: 0.98 }),
  water: new THREE.MeshStandardMaterial({ color: TERRAIN_BASE_COLORS.water, roughness: 0.7, metalness: 0.02 }),
  stone: new THREE.MeshStandardMaterial({ color: TERRAIN_BASE_COLORS.stone, roughness: 0.94 }),
  soil: new THREE.MeshStandardMaterial({ color: TERRAIN_BASE_COLORS.soil, roughness: 0.96 })
}

const TERRAIN_WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x83bfd9,
  transparent: true,
  opacity: 0.82,
  roughness: 0.18,
  metalness: 0.05
})

const TERRAIN_SOIL_PATCH_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xc39a6b, roughness: 0.95 })

type ScatterInstance = {
  x: number
  y?: number
  z: number
  rotationY?: number
  scale?: number
}

const TREE_TRUNK_GEOMETRY = new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6)
const TREE_CROWN_GEOMETRIES = [
  new THREE.IcosahedronGeometry(0.52, 0),
  new THREE.IcosahedronGeometry(0.36, 0),
  new THREE.IcosahedronGeometry(0.34, 0)
]
const TREE_TRUNK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 1 })
const TREE_FOLIAGE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x7db27c, roughness: 0.95 })
const ROCK_GEOMETRIES = [
  new THREE.BoxGeometry(0.45, 0.36, 0.36),
  new THREE.BoxGeometry(0.28, 0.24, 0.24),
  new THREE.BoxGeometry(0.24, 0.2, 0.22)
]
const ROCK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x88857b, roughness: 1 })
const FENCE_POST_GEOMETRY = new THREE.BoxGeometry(0.08, 0.55, 0.08)
const FENCE_RAIL_GEOMETRY = new THREE.BoxGeometry(1.1, 0.05, 0.05)
const FENCE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8b6846, roughness: 1 })

;[
  TREE_TRUNK_GEOMETRY,
  ...TREE_CROWN_GEOMETRIES,
  ...ROCK_GEOMETRIES,
  FENCE_POST_GEOMETRY,
  FENCE_RAIL_GEOMETRY
].forEach((geometry) => {
  geometry.userData.shared = true
})
;[TREE_TRUNK_MATERIAL, TREE_FOLIAGE_MATERIAL, ROCK_MATERIAL, FENCE_MATERIAL].forEach((material) => {
  material.userData.shared = true
})

Object.values(TERRAIN_BASE_MATERIALS).forEach((material) => {
  material.userData.shared = true
})
TERRAIN_WATER_MATERIAL.userData.shared = true
TERRAIN_SOIL_PATCH_MATERIAL.userData.shared = true

export function createTerrainTile(type: TerrainType, height = 0.2) {
  const group = new THREE.Group()
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), TERRAIN_BASE_MATERIALS[type])
  base.receiveShadow = true
  group.add(base)

  if (type === 'water') {
    const water = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.94), TERRAIN_WATER_MATERIAL)
    water.position.y = 0.06
    water.receiveShadow = true
    group.add(water)
  }

  if (type === 'soil') {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), TERRAIN_SOIL_PATCH_MATERIAL)
    patch.position.y = 0.12
    group.add(patch)
  }

  return group
}

export function createLowPolyTree(seed = 0) {
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 1 })
  )
  trunk.position.y = 0.45
  trunk.castShadow = true
  group.add(trunk)

  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x7db27c, roughness: 0.95 })
  const crowns = [
    { x: 0, y: 1.1, z: 0, s: 0.52 },
    { x: -0.16, y: 0.98, z: 0.06, s: 0.36 },
    { x: 0.18, y: 0.94, z: -0.08, s: 0.34 }
  ]
  crowns.forEach((crown, index) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(crown.s, 0), foliageMaterial)
    mesh.position.set(crown.x, crown.y, crown.z)
    mesh.rotation.y = seed * 0.3 + index * 0.4
    mesh.castShadow = true
    group.add(mesh)
  })
  return group
}

export function createInstancedTreeScatter(instances: ScatterInstance[]) {
  const group = new THREE.Group()
  if (instances.length === 0) return group

  const trunkMesh = new THREE.InstancedMesh(TREE_TRUNK_GEOMETRY, TREE_TRUNK_MATERIAL, instances.length)
  trunkMesh.castShadow = true

  const crownLayouts = [
    { x: 0, y: 1.1, z: 0, geometry: TREE_CROWN_GEOMETRIES[0], phase: 0 },
    { x: -0.16, y: 0.98, z: 0.06, geometry: TREE_CROWN_GEOMETRIES[1], phase: 0.4 },
    { x: 0.18, y: 0.94, z: -0.08, geometry: TREE_CROWN_GEOMETRIES[2], phase: 0.8 }
  ]
  const crownMeshes = crownLayouts.map((layout) => {
    const mesh = new THREE.InstancedMesh(layout.geometry, TREE_FOLIAGE_MATERIAL, instances.length)
    mesh.castShadow = true
    return mesh
  })

  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const offset = new THREE.Vector3()

  instances.forEach((instance, index) => {
    const size = instance.scale ?? 1
    const rotationY = instance.rotationY ?? 0
    const baseY = instance.y ?? 0
    quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0))
    scale.set(size, size, size)
    position.set(instance.x, baseY + 0.45 * size, instance.z)
    matrix.compose(position, quaternion, scale)
    trunkMesh.setMatrixAt(index, matrix)

    crownLayouts.forEach((layout, crownIndex) => {
      quaternion.setFromEuler(new THREE.Euler(0, rotationY + layout.phase, 0))
      offset.set(layout.x * size, layout.y * size, layout.z * size).applyQuaternion(quaternion)
      position.set(instance.x + offset.x, baseY + offset.y, instance.z + offset.z)
      matrix.compose(position, quaternion, scale)
      crownMeshes[crownIndex].setMatrixAt(index, matrix)
    })
  })

  trunkMesh.instanceMatrix.needsUpdate = true
  group.add(trunkMesh)
  crownMeshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  })
  return group
}

export function createRockCluster() {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: 0x88857b, roughness: 1 })
  ;[
    { x: 0, y: 0.18, z: 0, sx: 0.45, sy: 0.36, sz: 0.36 },
    { x: -0.2, y: 0.14, z: 0.12, sx: 0.28, sy: 0.24, sz: 0.24 },
    { x: 0.22, y: 0.12, z: -0.1, sx: 0.24, sy: 0.2, sz: 0.22 }
  ].forEach((shape) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(shape.sx, shape.sy, shape.sz), material)
    mesh.position.set(shape.x, shape.y, shape.z)
    mesh.rotation.y = 0.2
    mesh.castShadow = true
    group.add(mesh)
  })
  return group
}

export function createInstancedRockScatter(instances: ScatterInstance[]) {
  const group = new THREE.Group()
  if (instances.length === 0) return group

  const layouts = [
    { x: 0, y: 0.18, z: 0, geometry: ROCK_GEOMETRIES[0], rotation: 0.2 },
    { x: -0.2, y: 0.14, z: 0.12, geometry: ROCK_GEOMETRIES[1], rotation: -0.25 },
    { x: 0.22, y: 0.12, z: -0.1, geometry: ROCK_GEOMETRIES[2], rotation: 0.48 }
  ]
  const meshes = layouts.map((layout) => {
    const mesh = new THREE.InstancedMesh(layout.geometry, ROCK_MATERIAL, instances.length)
    mesh.castShadow = true
    return mesh
  })
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const offset = new THREE.Vector3()

  instances.forEach((instance, index) => {
    const size = instance.scale ?? 1
    const baseRotation = instance.rotationY ?? 0
    const baseY = instance.y ?? 0
    scale.set(size, size, size)
    layouts.forEach((layout, meshIndex) => {
      quaternion.setFromEuler(new THREE.Euler(0, baseRotation + layout.rotation, 0))
      offset.set(layout.x * size, layout.y * size, layout.z * size).applyQuaternion(quaternion)
      position.set(instance.x + offset.x, baseY + offset.y, instance.z + offset.z)
      matrix.compose(position, quaternion, scale)
      meshes[meshIndex].setMatrixAt(index, matrix)
    })
  })

  meshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  })
  return group
}

export function createDeskSet(accent = 0x7a634b) {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.95 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d7480, roughness: 0.85 })

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.55), wood)
  top.position.y = 0.76
  top.castShadow = true
  group.add(top)

  ;[
    [-0.35, 0.38, -0.18],
    [0.35, 0.38, -0.18],
    [-0.35, 0.38, 0.18],
    [0.35, 0.38, 0.18]
  ].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), metal)
    leg.position.set(x, y, z)
    leg.castShadow = true
    group.add(leg)
  })

  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.02), new THREE.MeshStandardMaterial({ color: 0x223047 }))
  monitor.position.set(0.06, 0.95, -0.08)
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), metal)
  stand.position.set(0.06, 0.84, -0.08)
  group.add(monitor, stand)

  const chair = createOfficeChair()
  chair.position.set(-0.05, 0, 0.62)
  group.add(chair)
  return group
}

export function createOfficeChair() {
  const group = new THREE.Group()
  const fabric = new THREE.MeshStandardMaterial({ color: 0x70739d, roughness: 0.95 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d7480, roughness: 0.85 })

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), fabric)
  seat.position.y = 0.45
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.08), fabric)
  back.position.set(0, 0.62, -0.12)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), metal)
  pole.position.y = 0.24
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.03, 0.03, 10), metal)
  base.position.y = 0.05
  group.add(seat, back, pole, base)
  return group
}

export function createSofa(color = 0x8a97c7) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.3, 0.42), material)
  base.position.y = 0.24
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.42, 0.12), material)
  back.position.set(0, 0.48, -0.16)
  const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.42), material)
  armLeft.position.set(-0.42, 0.27, 0)
  const armRight = armLeft.clone()
  armRight.position.x = 0.42
  group.add(base, back, armLeft, armRight)
  return group
}

export function createShelf() {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x7f6244, roughness: 0.95 })
  ;[-0.34, 0, 0.34].forEach((x) => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), wood)
    pole.position.set(x, 0.7, 0)
    pole.castShadow = true
    group.add(pole)
  })
  ;[0.15, 0.6, 1.05].forEach((y) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.32), wood)
    shelf.position.set(0, y, 0)
    shelf.castShadow = true
    group.add(shelf)
  })
  return group
}

export function createPlant() {
  const group = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xb7dce5 }))
  pot.position.y = 0.09
  group.add(pot)
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x98c9c1 }))
  leaves.position.y = 0.56
  leaves.castShadow = true
  group.add(leaves)
  return group
}

export function createLamp() {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6), new THREE.MeshStandardMaterial({ color: 0xc9b187 }))
  pole.position.y = 0.62
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0xe8dcc7 }))
  shade.position.y = 1.28
  group.add(pole, shade)
  return group
}

export function createWallSegment(length: number, height = 1.8, thickness = 0.12) {
  const material = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1 })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material)
  mesh.position.y = height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function createCarpet(color = 0x7ac4d3, width = 1.4, depth = 1) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.03, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
  )
  mesh.position.y = 0.03
  return mesh
}

export function createFenceSegment(length = 1.1) {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b6846, roughness: 1 })
  ;[-length / 2 + 0.08, length / 2 - 0.08].forEach((x) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), wood)
    post.position.set(x, 0.28, 0)
    post.castShadow = true
    group.add(post)
  })
  ;[0.2, 0.38].forEach((y) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.05), wood)
    rail.position.set(0, y, 0)
    rail.castShadow = true
    group.add(rail)
  })
  return group
}

export function createInstancedFenceScatter(instances: ScatterInstance[]) {
  const group = new THREE.Group()
  if (instances.length === 0) return group

  const postMesh = new THREE.InstancedMesh(FENCE_POST_GEOMETRY, FENCE_MATERIAL, instances.length * 2)
  const railMesh = new THREE.InstancedMesh(FENCE_RAIL_GEOMETRY, FENCE_MATERIAL, instances.length * 2)
  postMesh.castShadow = true
  railMesh.castShadow = true

  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3(1, 1, 1)
  const offset = new THREE.Vector3()
  let postIndex = 0
  let railIndex = 0

  instances.forEach((instance) => {
    const rotationY = instance.rotationY ?? 0
    const baseY = instance.y ?? 0
    quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0))

    ;[
      [-0.47, 0.28, 0],
      [0.47, 0.28, 0]
    ].forEach(([x, y, z]) => {
      offset.set(x, y, z).applyQuaternion(quaternion)
      position.set(instance.x + offset.x, baseY + offset.y, instance.z + offset.z)
      matrix.compose(position, quaternion, scale)
      postMesh.setMatrixAt(postIndex, matrix)
      postIndex += 1
    })

    ;[
      [0, 0.2, 0],
      [0, 0.38, 0]
    ].forEach(([x, y, z]) => {
      offset.set(x, y, z).applyQuaternion(quaternion)
      position.set(instance.x + offset.x, baseY + offset.y, instance.z + offset.z)
      matrix.compose(position, quaternion, scale)
      railMesh.setMatrixAt(railIndex, matrix)
      railIndex += 1
    })
  })

  postMesh.count = postIndex
  railMesh.count = railIndex
  postMesh.instanceMatrix.needsUpdate = true
  railMesh.instanceMatrix.needsUpdate = true
  group.add(postMesh, railMesh)
  return group
}

export function createLogPile() {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x8c6644, roughness: 1 })
  ;[
    { x: -0.18, y: 0.12, z: 0, r: 0.08, l: 0.48 },
    { x: 0.04, y: 0.14, z: 0.06, r: 0.08, l: 0.56 },
    { x: 0.22, y: 0.1, z: -0.04, r: 0.07, l: 0.42 }
  ].forEach((log, index) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(log.r, log.r, log.l, 6), wood)
    mesh.rotation.z = Math.PI / 2
    mesh.rotation.y = index * 0.35
    mesh.position.set(log.x, log.y, log.z)
    mesh.castShadow = true
    group.add(mesh)
  })
  return group
}

export function createCrateStack() {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: 0x946f4b, roughness: 1 })
  ;[
    { x: -0.18, y: 0.18, z: 0.06 },
    { x: 0.14, y: 0.18, z: -0.08 },
    { x: -0.02, y: 0.54, z: 0 }
  ].forEach((item) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), material)
    mesh.position.set(item.x, item.y, item.z)
    mesh.castShadow = true
    group.add(mesh)
  })
  return group
}

export function createCampfireProp() {
  const group = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d877b, roughness: 1 })
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8
    const rock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), stone)
    rock.position.set(Math.cos(angle) * 0.28, 0.06, Math.sin(angle) * 0.28)
    rock.rotation.y = angle
    rock.castShadow = true
    group.add(rock)
  }
  const ember = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.28, 6),
    new THREE.MeshStandardMaterial({ color: 0xffa94d, emissive: 0xff6b00, emissiveIntensity: 0.45 })
  )
  ember.position.y = 0.18
  ember.castShadow = true
  group.add(ember)
  return group
}

export function createSignpost() {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x85603d, roughness: 1 })
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), wood)
  post.position.y = 0.4
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.05), wood)
  board.position.set(0.12, 0.58, 0)
  board.rotation.z = -0.06
  post.castShadow = true
  board.castShadow = true
  group.add(post, board)
  return group
}

export function createCanopy(color = 0x7da8c7) {
  const group = new THREE.Group()
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x8e6a47, roughness: 1 })
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.2), cloth)
  top.position.y = 1.1
  top.rotation.z = 0.05
  group.add(top)
  ;[
    [-0.5, 0.52, -0.5],
    [0.5, 0.52, -0.5],
    [-0.5, 0.52, 0.5],
    [0.5, 0.52, 0.5]
  ].forEach(([x, y, z]) => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.04, 0.08), wood)
    pole.position.set(x, y, z)
    pole.castShadow = true
    group.add(pole)
  })
  return group
}

export function createBuildingModule(kind: BuildingKind) {
  if (kind === 'campfire') {
    const group = new THREE.Group()
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.14, 1.9),
      new THREE.MeshStandardMaterial({ color: 0xd2b083, roughness: 0.96 })
    )
    deck.position.y = 0.07
    deck.receiveShadow = true
    group.add(deck)
    const fire = createCampfireProp()
    fire.position.y = 0.1
    group.add(fire)
    ;[
      [-0.76, 0.16, -0.48],
      [0.76, 0.16, -0.48],
      [-0.46, 0.16, 0.66],
      [0.46, 0.16, 0.66]
    ].forEach(([x, y, z]) => {
      const seat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.72, 6),
        new THREE.MeshStandardMaterial({ color: 0x8d6744, roughness: 1 })
      )
      seat.rotation.z = Math.PI / 2
      seat.position.set(x, y, z)
      seat.castShadow = true
      group.add(seat)
    })
    const rug = createCarpet(0xe2c08f, 1.7, 1.3)
    rug.position.y = 0.145
    group.add(rug)
    return group
  }

  if (kind === 'storage') {
    const group = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.12, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x84694f, roughness: 1 })
    )
    base.position.y = 0.06
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.2, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x8e7357, roughness: 1 })
    )
    body.position.y = 0.66
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.55, 0.72, 4),
      new THREE.MeshStandardMaterial({ color: 0x5c4333, roughness: 1 })
    )
    roof.position.y = 1.5
    roof.rotation.y = Math.PI * 0.25
    const crates = createCrateStack()
    crates.position.set(0, 0, 0.88)
    group.add(base, body, roof, crates)
    return group
  }

  if (kind === 'workshop') {
    const group = new THREE.Group()
    const canopy = createCanopy(0x7898b2)
    const wood = new THREE.MeshStandardMaterial({ color: 0x8c6d57, roughness: 1 })
    const benchA = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.42), wood)
    benchA.position.set(-0.34, 0.72, -0.1)
    benchA.castShadow = true
    const benchB = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.42), wood)
    benchB.position.set(0.38, 0.72, 0.18)
    benchB.castShadow = true
    ;[
      [-0.72, 0.36, -0.1],
      [0.04, 0.36, -0.1],
      [-0.01, 0.36, 0.18],
      [0.77, 0.36, 0.18]
    ].forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), wood)
      leg.position.set(x, y, z)
      leg.castShadow = true
      group.add(leg)
    })
    const stoneBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xb0a391, roughness: 1 })
    )
    stoneBlock.position.set(-0.32, 0.9, -0.08)
    stoneBlock.castShadow = true
    const axe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0x6f7786, roughness: 0.8 }))
    axe.position.set(0.42, 0.88, 0.18)
    axe.rotation.z = 0.3
    axe.castShadow = true
    const logs = createLogPile()
    logs.position.set(0.82, 0, -0.72)
    const stones = createRockCluster()
    stones.position.set(-0.88, 0, 0.72)
    group.add(canopy, benchA, benchB, stoneBlock, axe, logs, stones)
    return group
  }

  const group = new THREE.Group()
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.12, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x8e6a49, roughness: 1 })
  )
  platform.position.y = 0.06
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.08, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xae8e69, roughness: 1 })
  )
  walls.position.y = 0.66
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.3, 0.78, 4),
    new THREE.MeshStandardMaterial({ color: 0x6b4f3d, roughness: 1 })
  )
  roof.position.y = 1.45
  roof.rotation.y = Math.PI * 0.25
  const sign = createSignpost()
  sign.position.set(-0.96, 0, 0.72)
  const plant = createPlant()
  plant.position.set(0.86, 0, -0.72)
  group.add(platform, walls, roof, sign, plant)
  return group
}
