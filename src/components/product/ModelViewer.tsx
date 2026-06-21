import { useEffect, useRef, useState, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { CameraControls, Edges } from '@react-three/drei'
import { ZoomIn, ZoomOut, Maximize2, Layers, Box as BoxIcon } from 'lucide-react'
import type CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'
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
// Cool studio backdrop + matched fog so distant ground melts into the sky for
// depth (instead of a flat muddy gray). Tuned to sit cleanly inside the dark UI.
const SCENE_BG = '#c6cdd6'
const SCENE_GROUND = '#aab1b9'

interface Appearance {
  color: string
  opacity: number
  transparent: boolean
  metalness: number
  roughness: number
  edges?: string // edge line color for crisp architectural definition
}

const MATERIALS: Record<string, Appearance> = {
  concrete: { color: '#aeaca6', opacity: 1, transparent: false, metalness: 0.05, roughness: 0.82, edges: '#6f6e68' },
  steel: { color: '#8b97a6', opacity: 1, transparent: false, metalness: 0.7, roughness: 0.33, edges: '#454d59' },
  mep: { color: '#f4a834', opacity: 0.6, transparent: true, metalness: 0.35, roughness: 0.45 },
  glass: { color: '#a9d0e8', opacity: 0.34, transparent: true, metalness: 0.45, roughness: 0.05, edges: '#5f8fae' },
  roofing: { color: '#39423f', opacity: 1, transparent: false, metalness: 0.15, roughness: 0.8, edges: '#222a28' },
  landscape: { color: '#7bab64', opacity: 1, transparent: false, metalness: 0, roughness: 0.95, edges: '#557a45' },
  // Site / landscape primitives (roads, paving, trees, parks, lamp posts).
  asphalt: { color: '#3a3e44', opacity: 1, transparent: false, metalness: 0.1, roughness: 0.95, edges: '#26292e' },
  paving: { color: '#c7ccd2', opacity: 1, transparent: false, metalness: 0.02, roughness: 0.9, edges: '#9aa0a8' },
  trunk: { color: '#6b4a2f', opacity: 1, transparent: false, metalness: 0, roughness: 0.95 },
  foliage: { color: '#5f9e54', opacity: 1, transparent: false, metalness: 0, roughness: 0.85 },
  grass: { color: '#6fae5a', opacity: 1, transparent: false, metalness: 0, roughness: 1 },
  lamp: { color: '#2f3438', opacity: 1, transparent: false, metalness: 0.6, roughness: 0.4, edges: '#1b1f22' },
  default: { color: '#bdb7ab', opacity: 1, transparent: false, metalness: 0.1, roughness: 0.78, edges: '#7d796f' },
}

// Site/landscape material families are never "shell massing" — they stay visible
// when the user strips the building's solid box/cylinder volumes.
const SITE_MATERIALS = new Set(['asphalt', 'paving', 'trunk', 'foliage', 'grass', 'lamp', 'landscape'])

// When the user removes the solid massing primitives we keep the skeleton
// (structural frame), the foundation, the systems layer, and the whole site.
function isMassing(group: ModelGroup): boolean {
  if (group.name === 'structural_frame') return false
  if (group.name === 'foundation_slab') return false
  if (group.name === 'mep_layer') return false
  if (SITE_MATERIALS.has(group.material)) return false
  return true
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

// structural_frame is rendered as a real steel skeleton — corner (and, for wide
// footprints, mid-span) columns, a full perimeter beam ring at EVERY floor
// level, plus diagonal braces — so the building reads structurally, not as a
// flat box. It stays a single named <group> so fitToBox/getObjectByName work.
//
// `floorLevels` are the absolute world-Y of each generated floor plate; we place
// a beam ring at each one so the supports sit between the actual storeys.
function StructuralFrame({
  group,
  isActive,
  floorLevels,
}: {
  group: ModelGroup
  isActive: boolean
  floorLevels: number[]
}) {
  const a = MATERIALS.steel!
  const [w = 20, h = 14, d = 20] = group.args
  const c = 0.45 // member thickness
  const halfW = w / 2 - c / 2
  const halfD = d / 2 - c / 2
  const baseY = group.position[1]

  // Column grid: 4 corners always; add mid-span columns on long sides so wide
  // floor plates have proper interior support.
  const xs = w > 30 ? [-halfW, 0, halfW] : [-halfW, halfW]
  const zs = d > 30 ? [-halfD, 0, halfD] : [-halfD, halfD]
  const columns: [number, number][] = []
  for (const x of xs) for (const z of zs) columns.push([x, z])

  // Beam rings: one per floor plate (converted to frame-local Y), always
  // including the base and roof line. De-duplicated + clamped to the frame.
  const localLevels = floorLevels.map((y) => y - baseY)
  const ringSet = new Set<number>([-h / 2 + c / 2, h / 2 - c / 2])
  for (const ly of localLevels) {
    const clamped = Math.max(-h / 2 + c / 2, Math.min(h / 2 - c / 2, ly))
    ringSet.add(Math.round(clamped * 100) / 100)
  }
  const beamYs = [...ringSet].sort((p, q) => p - q)

  // Diagonal cross-braces up two faces for visible lateral support.
  const braceLen = Math.hypot(w, h)
  const braceAngle = Math.atan2(h, w)

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
      {/* Diagonal braces on the two end faces (front/back), tucked to the side. */}
      {[halfD, -halfD].map((z, i) => (
        <mesh
          key={`brace-${i}`}
          position={[0, 0, z]}
          rotation={[0, 0, i === 0 ? braceAngle : -braceAngle]}
          castShadow
        >
          <boxGeometry args={[braceLen, c * 0.7, c * 0.7]} />
          <StandardMat a={a} isActive={isActive} />
        </mesh>
      ))}
    </group>
  )
}

function BuildingMesh({
  group,
  isActive,
  floorLevels,
}: {
  group: ModelGroup
  isActive: boolean
  floorLevels: number[]
}) {
  if (group.name === 'structural_frame' && group.type === 'BoxGeometry') {
    return <StructuralFrame group={group} isActive={isActive} floorLevels={floorLevels} />
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
  const modelRootRef = useRef<THREE.Group | null>(null)
  // Toggle the solid box/cylinder massing on/off — off reveals the skeleton.
  const [showShell, setShowShell] = useState(true)

  // Absolute Y of each generated floor plate → drives the per-floor beam rings.
  const floorLevels =
    sceneGraph?.groups
      .filter((g) => g.name.startsWith('floor_plate_'))
      .map((g) => g.position[1]) ?? []

  const visibleGroups =
    sceneGraph?.groups.filter((g) => showShell || !isMassing(g)) ?? []

  const zoomBy = (factor: number) => {
    const c = controlsRef.current
    if (!c) return
    // Proportional dolly so zoom feels consistent across tiny homes & towers.
    const step = Math.max(2, c.distance * factor)
    c.dolly(step, true)
  }
  const fitToModel = () => {
    const c = controlsRef.current
    const root = modelRootRef.current
    if (!c) return
    if (root) {
      const box = new THREE.Box3().setFromObject(root)
      if (!box.isEmpty()) {
        c.fitToBox(box, true, {
          paddingTop: 2,
          paddingBottom: 2,
          paddingLeft: 3,
          paddingRight: 3,
        })
        return
      }
    }
    c.setLookAt(30, 20, 30, 0, 7, 0, true)
  }

  return (
    <div className="model-viewer">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [30, 20, 30], fov: 45, near: 0.1, far: 400 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[SCENE_BG]} />
        <fog attach="fog" args={[SCENE_BG, 70, 230]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#e6edf4', '#6a7468', 0.55]} />
        <directionalLight
          position={[20, 30, 20]}
          intensity={1.35}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-far={160}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-15, 12, -10]} intensity={0.4} color="#cfe0ef" />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color={SCENE_GROUND} roughness={1} />
        </mesh>

        <CameraControls ref={controlsRef} makeDefault />

        <group ref={modelRootRef}>
          {visibleGroups.map((group) => (
            <BuildingMesh
              key={group.name}
              group={group}
              isActive={group.name === activeGroup}
              floorLevels={floorLevels}
            />
          ))}
        </group>

        <CameraRig
          activeGroup={activeGroup}
          controlsRef={controlsRef}
          sceneVersion={sceneVersion}
        />
      </Canvas>

      {/* Right-edge camera + display controls. */}
      <div className="model-viewer__controls" role="group" aria-label="Model view controls">
        <button className="model-ctrl" onClick={() => zoomBy(0.35)} title="Zoom in" aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button className="model-ctrl" onClick={() => zoomBy(-0.35)} title="Zoom out" aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button className="model-ctrl" onClick={fitToModel} title="Zoom to fit" aria-label="Zoom to fit">
          <Maximize2 size={16} />
        </button>
        <span className="model-ctrl__divider" aria-hidden />
        <button
          className={`model-ctrl model-ctrl--toggle${showShell ? '' : ' is-stripped'}`}
          onClick={() => setShowShell((v) => !v)}
          title={showShell ? 'Remove solid massing (show structure)' : 'Show solid massing'}
          aria-pressed={!showShell}
        >
          {showShell ? <Layers size={16} /> : <BoxIcon size={16} />}
        </button>
      </div>
    </div>
  )
}
