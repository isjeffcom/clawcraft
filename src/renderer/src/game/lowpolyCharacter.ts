import * as THREE from 'three'
import type { AnimState, Facing } from '@shared/contracts'

export type CharacterRig = {
  root: THREE.Group
  head: THREE.Group
  torso: THREE.Group
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  shadow: THREE.Mesh
}

function makeLimb(material: THREE.Material, width: number, height: number, depth: number): THREE.Group {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.y = -height / 2
  mesh.castShadow = true
  group.add(mesh)
  return group
}

export function createLowPolyCharacter(options: {
  bodyColor: number
  accentColor: number
  skinColor?: number
  isAdmin?: boolean
}): CharacterRig {
  const skinMaterial = new THREE.MeshStandardMaterial({ color: options.skinColor ?? 0xf0c7a5, roughness: 0.95 })
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: options.bodyColor, roughness: 0.9 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: options.accentColor, roughness: 0.8 })
  const bootMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 1 })

  const root = new THREE.Group()
  const torso = new THREE.Group()
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.24), bodyMaterial)
  torsoMesh.castShadow = true
  torsoMesh.position.y = 0.92
  torso.add(torsoMesh)

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.26), accentMaterial)
  chestPlate.position.set(0, 0.9, 0.13)
  chestPlate.castShadow = true
  torso.add(chestPlate)

  const head = new THREE.Group()
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), skinMaterial)
  neck.position.y = 1.26
  neck.castShadow = true
  head.add(neck)
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skinMaterial)
  headMesh.position.y = 1.42
  headMesh.castShadow = true
  head.add(headMesh)

  const faceBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.06, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x26364a, roughness: 0.8 })
  )
  faceBand.position.set(0, 1.44, 0.155)
  faceBand.castShadow = true
  head.add(faceBand)

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), skinMaterial)
  nose.position.set(0, 1.37, 0.158)
  nose.castShadow = true
  head.add(nose)

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: options.isAdmin ? 0x4b2e1e : 0x2d1f17 }))
  hair.position.y = 1.56
  hair.castShadow = true
  head.add(hair)

  const leftArm = makeLimb(bodyMaterial, 0.12, 0.42, 0.12)
  const rightArm = makeLimb(bodyMaterial, 0.12, 0.42, 0.12)
  leftArm.position.set(-0.3, 1.08, 0)
  rightArm.position.set(0.3, 1.08, 0)

  const leftLeg = makeLimb(bootMaterial, 0.14, 0.48, 0.14)
  const rightLeg = makeLimb(bootMaterial, 0.14, 0.48, 0.14)
  leftLeg.position.set(-0.12, 0.62, 0)
  rightLeg.position.set(0.12, 0.62, 0)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 20),
    new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.28 })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.03

  root.add(shadow, torso, head, leftArm, rightArm, leftLeg, rightLeg)

  if (options.isAdmin) {
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.28), new THREE.MeshStandardMaterial({ color: 0xffd54f }))
    sash.position.set(0.1, 0.92, 0)
    sash.rotation.z = 0.2
    sash.castShadow = true
    root.add(sash)
  }

  return { root, head, torso, leftArm, rightArm, leftLeg, rightLeg, shadow }
}

export function applyCharacterAnimation(
  rig: CharacterRig,
  elapsed: number,
  state: AnimState,
  facing: Facing,
  mood: 'stable' | 'emo',
  bobOffset = 0,
  groundY = 0,
  activity: 'chop' | 'mine' | 'build' | null = null,
  activityProgress = 0
) {
  const walkSpeed = mood === 'emo' ? 6 : 9
  const walkPhase = elapsed * walkSpeed + bobOffset
  const walkSwing = state === 'walk' ? Math.sin(walkPhase) * 0.55 : Math.sin(elapsed * 2 + bobOffset) * 0.05
  const idleBob = state === 'walk' ? Math.abs(Math.sin(walkPhase)) * 0.06 : Math.sin(elapsed * 2 + bobOffset) * 0.02
  const lookYaw = state === 'walk' ? Math.sin(walkPhase * 0.35) * 0.1 : Math.sin(elapsed * 1.4 + bobOffset) * 0.03
  const actionPhase = elapsed * (activity === 'mine' ? 10 : activity === 'build' ? 7 : 8) + bobOffset
  const actionSwing = Math.sin(actionPhase) * (0.9 + activityProgress * 0.2)

  rig.root.position.y = groundY + 0.02 + idleBob
  rig.leftArm.rotation.x = activity ? walkSwing * 0.2 : walkSwing
  rig.rightArm.rotation.x = activity ? -0.25 + Math.max(0, actionSwing) : -walkSwing
  rig.leftLeg.rotation.x = -walkSwing * 0.9
  rig.rightLeg.rotation.x = walkSwing * 0.9
  rig.head.rotation.x = activity ? 0.12 : mood === 'emo' ? 0.08 : Math.sin(elapsed * 1.8 + bobOffset) * 0.01
  rig.head.rotation.y = lookYaw
  rig.head.rotation.z = mood === 'emo' ? -0.12 : 0
  rig.torso.rotation.z = activity ? Math.sin(actionPhase) * 0.06 : mood === 'emo' ? -0.05 : 0
  rig.torso.rotation.x = activity ? 0.08 : 0
  rig.shadow.scale.setScalar(state === 'walk' ? 0.9 : 1)

  if (facing === 'north') rig.root.rotation.y = Math.PI
  else if (facing === 'east') rig.root.rotation.y = -Math.PI / 2
  else if (facing === 'west') rig.root.rotation.y = Math.PI / 2
  else rig.root.rotation.y = 0
}
