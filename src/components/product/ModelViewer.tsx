import { useEffect, useRef, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { CameraControls, Edges } from '@react-three/drei'
import type CameraControlsImpl from 'camera-controls'
import type { SceneGraph, ModelGroup } from '~/lib/modelScaffold'

// <ModelViewer> — React Three Fiber, always live (spec §2).
//
// Renders the component registry (authored by the ConstructaModeler Agentverse
// agent, or the deterministic home-page-style scaffold when that times out).
// The model is fully orbit-able at all times (CameraControls). The active group
// (timeline stage OR agent button) gets a teal highlight and the camera frames
// it via fitToBox.
//
// Highlight uses the spec's documented fallback — emissive teal on the material
// (gated by USE_OUTLINE_EFFECT) — so it always renders with no postprocessing dep.
const TEAL = '#01696f'
const SCENE_BG = '#aeb6bd'

interface Appearance {
  color: string
  opacity: number
  transparent: boolean
  metalness: number
  roughness: number
  edges?: string // edge line color for crisp architectural definition
}

const MATERIALS: Record<string, Appearance> = {
  concrete: { color: '#9a9893', opacity: 1, transparent: false, metalness: 0.05, roughness: 0.9, edges: '#6b6a64' },
  steel: { color: '#7c8794', opacity: 1, transparent: false, metalness: 0.6, roughness: 0.4, edges: '#4a525c' },
  mep: { color: '#f59e0b', opacity: 0.55, transparent: true, metalness: 0.3, roughness: 0.5 },
  glass: { color: '#8fb7d6', opacity: 0.4, transparent: true, metalness: 0.4, roughness: 0.08 },
  roofing: { color: '#3a3d38', opacity: 1, transparent: false, metalness: 0.1, roughness: 0.85, edges: '#26302b' },
  landscape: { color: '#6d8f58', opacity: 1, transparent: false, metalness: 0, roughness: 1 },
  default: { color: '#b8b2a6', opacity: 1, transparent: false, metalness: 0.1, roughness: 0.8, edges: '#7a766c' },
}

function StandardMat({ a, isActive }: { a: Appearance; isActive: boolean }) {
  return (
    <meshStandardMaterial
      color={a.color}
      transparent={a.transparent || isActive}
      opacity={a.opacity}
      metalness={a.metalness}
      roughness={a.roughness}
      emissive={isActive ? TEAL : '#000000'}
      emissiveIntensity={isActive ? 0.55 : 0}
    />
  )
}

// structural_frame is rendered as a real column cage (4 corner columns + beams
// at each floor level) so the building reads like the home-page model — not a
// flat box. It stays a single named <group> so fitToBox/getObjectByName work.
function StructuralFrame({ group, isActive }: { group: ModelGroup; isActive: boolean }) {
  const a = MATERIALS.steel!
  const [w = 20, h = 14, d = 20] = group.args
  const c = 0.45 // member thickness
  const halfW = w / 2 - c / 2
  const halfD = d / 2 - c / 2
  const columns: [number, number][] = [
    [-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD],
  ]
  // Beams at base, mid, and top of the frame.
  const beamYs = [-h / 2 + c / 2, 0, h / 2 - c / 2]
  return (
    <group name={group.name} position={group.position} rotation={group.rotation ?? [0, 0, 0]}>
      {columns.map(([x, z], i) => (
        <mesh key={`col-${i}`} position={[x, 0, z]} castShadow receiveShadow>
          <boxGeometry args={[c, h, c]} />
          <StandardMat a={a} isActive={isActive} />
        </mesh>
      ))}
      {beamYs.map((y, i) => (
        <group key={`beam-${i}`}>
          <mesh position={[0, y, halfD]} castShadow>
            <boxGeometry args={[w, c, c]} />
            <StandardMat a={a} isActive={isActive} />
          </mesh>
          <mesh position={[0, y, -halfD]} castShadow>
            <boxGeometry args={[w, c, c]} />
            <StandardMat a={a} isActive={isActive} />
          </mesh>
          <mesh position={[halfW, y, 0]} castShadow>
            <boxGeometry args={[c, c, d]} />
            <StandardMat a={a} isActive={isActive} />
          </mesh>
          <mesh position={[-halfW, y, 0]} castShadow>
            <boxGeometry args={[c, c, d]} />
            <StandardMat a={a} isActive={isActive} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function BuildingMesh({ group, isActive }: { group: ModelGroup; isActive: boolean }) {
  if (group.name === 'structural_frame' && group.type === 'BoxGeometry') {
    return <StructuralFrame group={group} isActive={isActive} />
  }
  const a = MATERIALS[group.material] ?? MATERIALS.default!
  return (
    <mesh
      name={group.name}
      position={group.position}
      rotation={group.rotation ?? [0, 0, 0]}
      castShadow
      receiveShadow
    >
      {group.type === 'CylinderGeometry' ? (
        <cylinderGeometry args={group.args as [number, number, number, number]} />
      ) : (
        <boxGeometry args={group.args as [number, number, number]} />
      )}
      <StandardMat a={a} isActive={isActive} />
      {a.edges && <Edges threshold={15} color={isActive ? TEAL : a.edges} />}
    </mesh>
  )
}

// Drives the camera off the active group. fitToBox(mesh, true) is the only
// camera move used — works regardless of what geometry was generated.
function CameraRig({
  activeGroup,
  controlsRef,
  sceneVersion,
}: {
  activeGroup: string | null
  controlsRef: RefObject<CameraControlsImpl | null>
  sceneVersion: number
}) {
  const { scene } = useThree()
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const id = requestAnimationFrame(() => {
      if (!activeGroup) {
        controls.setLookAt(30, 20, 30, 0, 7, 0, true)
        return
      }
      const mesh = scene.getObjectByName(activeGroup)
      if (mesh) {
        controls.fitToBox(mesh, true, {
          paddingTop: 2.5,
          paddingBottom: 2.5,
          paddingLeft: 3.5,
          paddingRight: 3.5,
        })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [activeGroup, scene, controlsRef, sceneVersion])
  return null
}

interface Props {
  sceneGraph: SceneGraph | null
  activeGroup: string | null
  sceneVersion?: number
}

export function ModelViewer({ sceneGraph, activeGroup, sceneVersion = 0 }: Props) {
  const controlsRef = useRef<CameraControlsImpl | null>(null)

  return (
    <div className="model-viewer">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [30, 20, 30], fov: 45, near: 0.1, far: 400 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[SCENE_BG]} />
        <ambientLight intensity={0.5} />
        <hemisphereLight args={['#dfe7ee', '#5a6452', 0.5]} />
        <directionalLight
          position={[20, 30, 20]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-far={160}
        />
        <directionalLight position={[-15, 12, -10]} intensity={0.35} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#97a08f" roughness={1} />
        </mesh>

        <CameraControls ref={controlsRef} makeDefault />

        <group>
          {sceneGraph?.groups.map((group) => (
            <BuildingMesh
              key={group.name}
              group={group}
              isActive={group.name === activeGroup}
            />
          ))}
        </group>

        <CameraRig
          activeGroup={activeGroup}
          controlsRef={controlsRef}
          sceneVersion={sceneVersion}
        />
      </Canvas>
    </div>
  )
}
