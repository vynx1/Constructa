import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import type { Group } from 'three'
import * as THREE from 'three'

interface DemoBuildCanvasProps {
  buildStep: number
  holdFinal?: boolean
}

const SCENE_BG = '#8fa888'
export const DEMO_VIEW_HEIGHT = 440

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function useRise(active: boolean, speed = 3.2) {
  const ref = useRef<Group>(null)
  const progress = useRef(0)

  useFrame((_, delta) => {
    const target = active ? 1 : 0
    progress.current +=
      (target - progress.current) * Math.min(1, delta * (active ? speed : speed * 2))

    const group = ref.current
    if (!group) return

    const eased = easeOutCubic(progress.current)
    group.position.y = THREE.MathUtils.lerp(-2.5, 0, eased)
    group.visible = progress.current > 0.03
  })

  return ref
}

function makeSatelliteGroundTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#6d8f58'
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 140; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 8 + Math.random() * 28
    ctx.fillStyle = `rgba(${70 + Math.random() * 40}, ${100 + Math.random() * 50}, ${55 + Math.random() * 30}, 0.35)`
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${110 + Math.random() * 30}, ${95 + Math.random() * 25}, ${60 + Math.random() * 20}, 0.2)`
    ctx.fillRect(Math.random() * size, Math.random() * size, 6 + Math.random() * 18, 4 + Math.random() * 10)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 3)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeAsphaltTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#3a3d38'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeFacadeTexture(tone: 'retail' | 'residential') {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  if (tone === 'retail') {
    canvas.width = 175
    canvas.height = 72
    ctx.fillStyle = '#9a6848'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#c8553d'
    ctx.fillRect(0, 0, canvas.width, 12)
    ctx.fillStyle = '#1a2830'
    ctx.fillRect(10, 18, canvas.width - 20, canvas.height - 28)
    for (let x = 24; x < canvas.width - 24; x += 28) {
      ctx.fillStyle = 'rgba(180,210,230,0.18)'
      ctx.fillRect(x, 22, 12, canvas.height - 36)
    }
  } else {
    canvas.width = 160
    canvas.height = 48
    ctx.fillStyle = '#ddd5c8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(180,170,155,0.35)'
    ctx.fillRect(0, canvas.height - 6, canvas.width, 6)
    ctx.strokeStyle = 'rgba(150,140,125,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeRoofTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e8e6e0'
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  for (let i = 0; i < 128; i += 8) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 128)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function RisingAssembly({
  active,
  elevation = 0,
  children,
}: {
  active: boolean
  elevation?: number
  children: ReactNode
}) {
  const innerRef = useRise(active)
  return (
    <group position={[0, elevation, 0]}>
      <group ref={innerRef}>{children}</group>
    </group>
  )
}

function StreetTree({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow>
        <circleGeometry args={[0.55 * scale, 20]} />
        <meshStandardMaterial color="#2f5c34" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.35 * scale, 0]} castShadow>
        <cylinderGeometry args={[0.05 * scale, 0.07 * scale, 0.35 * scale, 6]} />
        <meshStandardMaterial color="#5c4636" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.72 * scale, 0]} castShadow>
        <sphereGeometry args={[0.38 * scale, 10, 8]} />
        <meshStandardMaterial color="#3f7344" roughness={0.88} />
      </mesh>
    </group>
  )
}

function SiteEnvironment({
  visible,
  groundTex,
  asphaltTex,
}: {
  visible: boolean
  groundTex: THREE.CanvasTexture
  asphaltTex: THREE.CanvasTexture
}) {
  return (
    <RisingAssembly active={visible}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial map={groundTex} roughness={0.95} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 4.8]} receiveShadow>
        <planeGeometry args={[22, 3.6]} />
        <meshStandardMaterial map={asphaltTex} roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[22, 3.2]} />
        <meshStandardMaterial map={asphaltTex} roughness={0.85} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 4.8]}>
        <planeGeometry args={[22, 0.08]} />
        <meshStandardMaterial color="#d9d2c4" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 3.35]} receiveShadow>
        <planeGeometry args={[4.2, 5.2]} />
        <meshStandardMaterial color="#b8b2a6" roughness={0.92} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.8, 0.017, 3.6]} receiveShadow>
        <planeGeometry args={[2.8, 4.6]} />
        <meshStandardMaterial color="#4a4d48" roughness={0.8} />
      </mesh>
      {[-0.9, 0, 0.9].map((z) => (
        <mesh key={`stall-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[-2.8, 0.02, 3.2 + z]}>
          <planeGeometry args={[2.6, 0.06]} />
          <meshStandardMaterial color="#e8e4da" />
        </mesh>
      ))}

      <StreetTree position={[-5.5, 0, 5.2]} scale={1.1} />
      <StreetTree position={[5.2, 0, 5.5]} scale={0.95} />
      <StreetTree position={[-6.2, 0, 1.5]} scale={1.05} />
      <StreetTree position={[6.0, 0, -1.0]} scale={1.0} />
      <StreetTree position={[-4.8, 0, -5.0]} scale={0.9} />
      <StreetTree position={[5.5, 0, -5.2]} scale={1.15} />
      <StreetTree position={[-7.0, 0, -3.5]} scale={0.85} />
      <StreetTree position={[7.2, 0, 3.0]} scale={0.9} />
    </RisingAssembly>
  )
}

/** Realistic mixed-use proportions (~1 unit ≈ 3 m). Three stories + retail base. */
const B = {
  width: 3.6,
  depth: 2.55,
  foundation: 0.14,
  retail: 1.5,
  residential: 1.1,
  roof: 0.1,
} as const

const RETAIL_TOP = B.foundation + B.retail
const FLOOR2_TOP = RETAIL_TOP + B.residential
const FLOOR3_TOP = FLOOR2_TOP + B.residential
const ROOF_TOP = FLOOR3_TOP + B.roof

const RES_WINDOW_X = [-1.15, -0.38, 0.38, 1.15] as const

function ResidentialWindows({ floorY }: { floorY: number }) {
  return (
    <>
      {RES_WINDOW_X.map((x) => (
        <mesh key={`win-${floorY}-${x}`} position={[x, floorY, B.depth / 2 + 0.02]}>
          <planeGeometry args={[0.52, 0.62]} />
          <meshStandardMaterial color="#2e3c48" metalness={0.22} roughness={0.18} />
        </mesh>
      ))}
    </>
  )
}

function MixedUseBuilding({
  buildStep,
  retailFacade,
  residentialFacade,
  roofTex,
}: {
  buildStep: number
  retailFacade: THREE.CanvasTexture
  residentialFacade: THREE.CanvasTexture
  roofTex: THREE.CanvasTexture
}) {
  return (
    <group position={[0, 0, 0.35]}>
      <RisingAssembly active={buildStep >= 1}>
        <mesh position={[0, B.foundation / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[B.width + 0.15, B.foundation, B.depth + 0.2]} />
          <meshStandardMaterial color="#7a7872" roughness={0.9} />
        </mesh>
      </RisingAssembly>

      {/* Ground-floor retail — ~16 ft clear height, full-width storefront */}
      <RisingAssembly active={buildStep >= 2}>
        <mesh position={[0, B.foundation + B.retail / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[B.width, B.retail, B.depth]} />
          <meshStandardMaterial map={retailFacade} roughness={0.82} />
        </mesh>
        <mesh position={[0, B.foundation + B.retail * 0.38, B.depth / 2 + 0.04]} castShadow>
          <boxGeometry args={[B.width - 0.35, B.retail * 0.72, 0.08]} />
          <meshStandardMaterial
            color="#87aecf"
            transparent
            opacity={0.55}
            metalness={0.45}
            roughness={0.08}
          />
        </mesh>
        {[-1.05, 0, 1.05].map((x) => (
          <mesh
            key={`mullion-${x}`}
            position={[x, B.foundation + B.retail * 0.38, B.depth / 2 + 0.05]}
          >
            <boxGeometry args={[0.05, B.retail * 0.68, 0.04]} />
            <meshStandardMaterial color="#2a343c" />
          </mesh>
        ))}
        <mesh position={[0, B.foundation + B.retail + 0.06, B.depth / 2 - 0.08]} castShadow>
          <boxGeometry args={[B.width - 0.2, 0.12, 0.55]} />
          <meshStandardMaterial color="#c8553d" roughness={0.75} />
        </mesh>
        <mesh position={[0, B.foundation + B.retail - 0.04, B.depth / 2 - 0.22]} castShadow>
          <boxGeometry args={[B.width - 0.55, 0.04, 0.35]} />
          <meshStandardMaterial color="#f5f0e8" roughness={0.6} />
        </mesh>
        <mesh position={[0, B.foundation + B.retail * 0.22, B.depth / 2 + 0.03]}>
          <boxGeometry args={[1.05, B.retail * 0.65, 0.18]} />
          <meshStandardMaterial color="#1a2228" roughness={0.4} />
        </mesh>
      </RisingAssembly>

      {/* Second story — residential */}
      <RisingAssembly active={buildStep >= 3} elevation={RETAIL_TOP}>
        <mesh position={[0, B.residential / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[B.width - 0.15, B.residential, B.depth - 0.1]} />
          <meshStandardMaterial map={residentialFacade} roughness={0.88} />
        </mesh>
        <mesh position={[0, B.residential / 2, B.depth / 2 - 0.03]} castShadow>
          <boxGeometry args={[B.width - 0.65, 0.05, 0.24]} />
          <meshStandardMaterial color="#b8b0a4" metalness={0.2} roughness={0.35} />
        </mesh>
        <ResidentialWindows floorY={B.residential / 2} />
      </RisingAssembly>

      {/* Third story — residential */}
      <RisingAssembly active={buildStep >= 4} elevation={FLOOR2_TOP}>
        <mesh position={[0, B.residential / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[B.width - 0.15, B.residential, B.depth - 0.1]} />
          <meshStandardMaterial map={residentialFacade} roughness={0.88} />
        </mesh>
        <mesh position={[0, B.residential / 2, B.depth / 2 - 0.03]} castShadow>
          <boxGeometry args={[B.width - 0.65, 0.05, 0.24]} />
          <meshStandardMaterial color="#b8b0a4" metalness={0.2} roughness={0.35} />
        </mesh>
        <ResidentialWindows floorY={B.residential / 2} />
      </RisingAssembly>

      {/* Roof + Title 24 solar */}
      <RisingAssembly active={buildStep >= 5} elevation={FLOOR3_TOP}>
        <mesh position={[0, B.roof / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[B.width - 0.1, B.roof, B.depth - 0.05]} />
          <meshStandardMaterial map={roofTex} roughness={0.92} />
        </mesh>
        {[-0.95, 0, 0.95].map((x) => (
          <mesh key={`pv-${x}`} position={[x, B.roof + 0.08, 0]} rotation={[-0.18, 0, 0]} castShadow>
            <boxGeometry args={[0.88, 0.03, 1.5]} />
            <meshStandardMaterial color="#1a3654" metalness={0.55} roughness={0.2} />
          </mesh>
        ))}
        <mesh position={[1.05, B.roof + 0.12, -0.38]} castShadow>
          <boxGeometry args={[0.55, 0.28, 0.42]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.35} roughness={0.45} />
        </mesh>
      </RisingAssembly>
    </group>
  )
}

function BuildScene({
  buildStep,
  holdFinal,
  textures,
}: {
  buildStep: number
  holdFinal: boolean
  textures: {
    ground: THREE.CanvasTexture
    asphalt: THREE.CanvasTexture
    retail: THREE.CanvasTexture
    residential: THREE.CanvasTexture
    roof: THREE.CanvasTexture
  }
}) {
  const rig = useRef<Group>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)

  useEffect(() => {
    cameraRef.current?.lookAt(0, ROOF_TOP / 2, 0.2)
  }, [])

  useFrame((_, delta) => {
    if (!rig.current) return
    rig.current.rotation.y += delta * (holdFinal ? 0.035 : 0.1)
  })

  return (
    <>
      <color attach="background" args={[SCENE_BG]} />
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={[7.5, 11.5, 7.5]}
        fov={38}
        near={0.1}
        far={120}
      />
      <ambientLight intensity={0.72} />
      <directionalLight
        position={[8, 16, 6]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight position={[-4, 6, -3]} intensity={0.35} />
      <hemisphereLight args={['#dce8d0', '#4a5a42', 0.45]} />

      <group ref={rig}>
        <SiteEnvironment
          visible={buildStep >= 1}
          groundTex={textures.ground}
          asphaltTex={textures.asphalt}
        />
        <MixedUseBuilding
          buildStep={buildStep}
          retailFacade={textures.retail}
          residentialFacade={textures.residential}
          roofTex={textures.roof}
        />
      </group>
    </>
  )
}

export function DemoBuildCanvas({ buildStep, holdFinal = false }: DemoBuildCanvasProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const textures = useMemo(() => {
    if (typeof document === 'undefined') return null
    return {
      ground: makeSatelliteGroundTexture(),
      asphalt: makeAsphaltTexture(),
      retail: makeFacadeTexture('retail'),
      residential: makeFacadeTexture('residential'),
      roof: makeRoofTexture(),
    }
  }, [mounted])

  if (!mounted || !textures) {
    return (
      <div
        className="h-full w-full rounded-xl"
        style={{ background: SCENE_BG }}
        aria-hidden
      />
    )
  }

  return (
    <div
      className="relative z-0 h-full w-full overflow-hidden rounded-xl border border-slate-300/40"
      style={{ background: SCENE_BG }}
    >
      <Canvas
        dpr={[1, 1.75]}
        shadows
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(SCENE_BG)
        }}
      >
        <BuildScene buildStep={buildStep} holdFinal={holdFinal} textures={textures} />
      </Canvas>
    </div>
  )
}
