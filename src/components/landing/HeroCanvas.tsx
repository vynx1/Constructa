import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// Page 1 hero: a low-poly apartment building the user can orbit.
// SSR-safe — the WebGL canvas only mounts on the client. A "drag to rotate"
// hint shows on first load and fades the moment the user grabs the model.
export function HeroCanvas() {
  const [mounted, setMounted] = useState(false)
  const [interacted, setInteracted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="hero__canvas hero__canvas--poster" aria-hidden />
  }

  return (
    <div
      className="hero__canvas"
      onPointerDown={() => setInteracted(true)}
    >
      <Canvas dpr={[1, 2]} shadows>
        <Scene />
      </Canvas>

      {/* Rotate hint — disappears after the first interaction. */}
      <div
        className={`rotate-hint ${interacted ? 'rotate-hint--hidden' : ''}`}
        aria-hidden
      >
        <span className="rotate-hint__arrow rotate-hint__arrow--left">‹</span>
        <span className="rotate-hint__label">Drag to rotate</span>
        <span className="rotate-hint__arrow rotate-hint__arrow--right">›</span>
      </div>
    </div>
  )
}

function Scene() {
  useGSAP(() => {
    // Proves the GSAP + ScrollTrigger pipeline; cinematic timeline lands later.
    ScrollTrigger.create({
      trigger: '.landing',
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
    })
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={[10, 6, 12]} fov={40} />
      {/* Soft fog blends the far edges of the district into the page. */}
      <fog attach="fog" args={['#f3f0ea', 16, 34]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-6, 5, -5]} intensity={0.35} />

      <District />

      {/* Ground / parcel grid the district sits on */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#e9e6e0" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40, 40, 40]} />
        <meshBasicMaterial color="#d3ccbf" wireframe transparent opacity={0.45} />
      </mesh>

      {/* Always auto-rotates, and stays draggable at any time — grabbing it
          rotates manually, and the gentle spin resumes when you let go. */}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.85}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 1.4, 0]}
      />
    </>
  )
}

// An apartment block: several procedural buildings of varied height/footprint
// laid out on a street grid, so orbiting rotates through a whole district.
function District() {
  const lots = useMemo(() => {
    const palette = ['#dcd6cb', '#d6cfc2', '#e1dbd0', '#cfc7b8']
    const defs: {
      pos: [number, number, number]
      floors: number
      w: number
      d: number
      color: string
    }[] = [
      { pos: [0, 0, 0], floors: 8, w: 2.4, d: 2.0, color: palette[0]! },
      { pos: [-4.2, 0, 0.6], floors: 5, w: 2.2, d: 1.8, color: palette[1]! },
      { pos: [4.0, 0, -0.4], floors: 6, w: 2.0, d: 2.2, color: palette[2]! },
      { pos: [-3.6, 0, -4.4], floors: 7, w: 2.0, d: 1.8, color: palette[3]! },
      { pos: [0.4, 0, -5.0], floors: 4, w: 2.6, d: 1.6, color: palette[1]! },
      { pos: [4.6, 0, 4.4], floors: 5, w: 1.8, d: 1.8, color: palette[0]! },
      { pos: [-4.4, 0, 4.8], floors: 6, w: 1.8, d: 2.0, color: palette[2]! },
    ]
    return defs
  }, [])

  return (
    <group>
      {lots.map((l, i) => (
        <ApartmentBuilding
          key={i}
          position={l.pos}
          floors={l.floors}
          width={l.w}
          depth={l.d}
          color={l.color}
        />
      ))}
    </group>
  )
}

// Stylized low-poly apartment building: a slab body with a grid of inset
// windows on every face, stacked balconies up the front, and a rooftop unit.
function ApartmentBuilding({
  position = [0, 0, 0],
  floors = 7,
  width = 2.6,
  depth = 2.0,
  color = '#dcd6cb',
}: {
  position?: [number, number, number]
  floors?: number
  width?: number
  depth?: number
  color?: string
}) {
  const FLOORS = floors
  const FLOOR_H = 0.62
  const W = width // width (x)
  const D = depth // depth (z)
  const bodyH = FLOORS * FLOOR_H

  // Window positions across the four facades, one row per floor.
  const windows = useMemo(() => {
    const out: { pos: [number, number, number]; rot: [number, number, number] }[] =
      []
    const cols = 4
    for (let f = 0; f < FLOORS; f++) {
      const y = FLOOR_H * (f + 0.5)
      // front (+z) and back (-z)
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + (W / (cols + 1)) * (c + 1)
        out.push({ pos: [x, y, D / 2 + 0.001], rot: [0, 0, 0] })
        out.push({ pos: [x, y, -D / 2 - 0.001], rot: [0, Math.PI, 0] })
      }
      // sides (+x / -x)
      const sideCols = 3
      for (let c = 0; c < sideCols; c++) {
        const z = -D / 2 + (D / (sideCols + 1)) * (c + 1)
        out.push({ pos: [W / 2 + 0.001, y, z], rot: [0, Math.PI / 2, 0] })
        out.push({ pos: [-W / 2 - 0.001, y, z], rot: [0, -Math.PI / 2, 0] })
      }
    }
    return out
  }, [FLOORS, W, D])

  return (
    <group position={position}>
      {/* Main body */}
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, bodyH, D]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Floor banding lines */}
      {Array.from({ length: FLOORS - 1 }, (_, i) => (
        <mesh key={`band-${i}`} position={[0, FLOOR_H * (i + 1), 0]}>
          <boxGeometry args={[W + 0.04, 0.04, D + 0.04]} />
          <meshStandardMaterial color="#c4bdb0" />
        </mesh>
      ))}

      {/* Windows */}
      {windows.map((w, i) => (
        <mesh key={`win-${i}`} position={w.pos} rotation={w.rot}>
          <planeGeometry args={[0.34, 0.4]} />
          <meshStandardMaterial
            color="#3c4a57"
            metalness={0.3}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Stacked balconies up the front face */}
      {Array.from({ length: FLOORS - 1 }, (_, i) => (
        <mesh
          key={`bal-${i}`}
          position={[0, FLOOR_H * (i + 1), D / 2 + 0.18]}
          castShadow
        >
          <boxGeometry args={[W * 0.78, 0.06, 0.36]} />
          <meshStandardMaterial color="#cfc8bb" />
        </mesh>
      ))}

      {/* Roof cap + rooftop unit */}
      <mesh position={[0, bodyH + 0.04, 0]} castShadow>
        <boxGeometry args={[W + 0.12, 0.12, D + 0.12]} />
        <meshStandardMaterial color="#b9b1a3" />
      </mesh>
      <mesh position={[0.5, bodyH + 0.3, -0.3]} castShadow>
        <boxGeometry args={[0.7, 0.4, 0.6]} />
        <meshStandardMaterial color="#c4bdb0" />
      </mesh>

      {/* Ground-floor entrance */}
      <mesh position={[0, 0.32, D / 2 + 0.02]}>
        <planeGeometry args={[0.6, 0.62]} />
        <meshStandardMaterial color="#2c3640" />
      </mesh>
    </group>
  )
}
