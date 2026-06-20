import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// A 3D, interactive teaser map of the continental US. A low-poly landmass is
// extruded and tilted; hot development markets sit on top as pillars whose
// height encodes development pressure. Hovering a market raises it and reveals
// a small card of unique, market-specific stats.

interface Market {
  id: string
  name: string
  // Position in the map plane: x = west→east, y = south→north (pre-rotation).
  x: number
  y: number
  pressure: number // 0..1 -> pillar height + color
  stats: { permits: string; landTrend: string; note: string }
}

const MARKETS: Market[] = [
  {
    id: 'sea',
    name: 'Seattle, WA',
    x: -1.45,
    y: 0.78,
    pressure: 0.62,
    stats: { permits: '+14% YoY', landTrend: '$210/sqft', note: 'Tech-led infill demand' },
  },
  {
    id: 'bay',
    name: 'Bay Area, CA',
    x: -1.5,
    y: 0.28,
    pressure: 0.78,
    stats: { permits: '+9% YoY', landTrend: '$430/sqft', note: 'CEQA-heavy, high upside' },
  },
  {
    id: 'la',
    name: 'LA Basin, CA',
    x: -1.34,
    y: 0.02,
    pressure: 0.84,
    stats: { permits: '+18% YoY', landTrend: '$365/sqft', note: 'SB-9 lot splits surging' },
  },
  {
    id: 'phx',
    name: 'Phoenix, AZ',
    x: -1.0,
    y: -0.16,
    pressure: 0.9,
    stats: { permits: '+27% YoY', landTrend: '$120/sqft', note: 'Fastest permit velocity' },
  },
  {
    id: 'den',
    name: 'Denver, CO',
    x: -0.52,
    y: 0.22,
    pressure: 0.66,
    stats: { permits: '+11% YoY', landTrend: '$190/sqft', note: 'Front Range water limits' },
  },
  {
    id: 'atx',
    name: 'Austin, TX',
    x: -0.22,
    y: -0.46,
    pressure: 0.88,
    stats: { permits: '+24% YoY', landTrend: '$155/sqft', note: 'Low-friction approvals' },
  },
  {
    id: 'chi',
    name: 'Chicago, IL',
    x: 0.5,
    y: 0.46,
    pressure: 0.48,
    stats: { permits: '+4% YoY', landTrend: '$140/sqft', note: 'Adaptive-reuse plays' },
  },
  {
    id: 'atl',
    name: 'Atlanta, GA',
    x: 0.7,
    y: -0.32,
    pressure: 0.7,
    stats: { permits: '+16% YoY', landTrend: '$95/sqft', note: 'Sun Belt in-migration' },
  },
  {
    id: 'mia',
    name: 'Miami, FL',
    x: 0.82,
    y: -0.82,
    pressure: 0.74,
    stats: { permits: '+13% YoY', landTrend: '$280/sqft', note: 'Flood-zone overlays' },
  },
  {
    id: 'nyc',
    name: 'NYC Metro',
    x: 1.24,
    y: 0.3,
    pressure: 0.58,
    stats: { permits: '+6% YoY', landTrend: '$520/sqft', note: 'Dense, code-intensive' },
  },
]

export function USMapTeaser() {
  const [mounted, setMounted] = useState(false)
  // Clicking a market pins its card; it stays until you click empty space or
  // another market.
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="usmap usmap--poster" aria-hidden />
  }

  return (
    <div className="usmap">
      <Canvas dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
        {/* The map stands up like a wall map facing the viewer: west coast on
            the left, east coast on the right, north up. It's tilted back just
            slightly so the pins clearly read as sticking out of the page. */}
        <PerspectiveCamera makeDefault position={[0, 0.5, 4.6]} fov={44} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[0, 2, 6]} intensity={1.0} />
        <directionalLight position={[-3, 3, 4]} intensity={0.4} />
        <group rotation={[-0.32, 0, 0]} position={[0, 0.1, 0]}>
          <Landmass />
          {MARKETS.map((m) => (
            <MarketPillar
              key={m.id}
              market={m}
              selected={selected === m.id}
              onSelect={setSelected}
            />
          ))}
        </group>
        {/* Stationary view — no rotation, so the map holds still while you
            hover and click pins. */}
      </Canvas>
      <p className="usmap__hint">Hover to preview · click a market to pin it</p>
    </div>
  )
}

// Rough continental-US outline, extruded into a thin slab.
function Landmass() {
  const geometry = useMemo(() => {
    const pts: [number, number][] = [
      [-1.55, 0.95],
      [-1.5, 0.4],
      [-1.35, 0.05],
      [-1.25, -0.05],
      [-0.9, -0.15],
      [-0.55, -0.25],
      [-0.3, -0.35],
      [-0.15, -0.7],
      [0.0, -0.4],
      [0.2, -0.45],
      [0.45, -0.5],
      [0.6, -0.45],
      [0.75, -0.5],
      [0.8, -0.9],
      [0.92, -0.45],
      [1.05, -0.2],
      [1.2, 0.1],
      [1.4, 0.45],
      [1.5, 0.7],
      [1.2, 0.75],
      [1.05, 0.6],
      [0.85, 0.8],
      [0.4, 0.85],
      [-0.2, 0.9],
      [-0.8, 0.9],
    ]
    const shape = new THREE.Shape()
    shape.moveTo(pts[0]![0], pts[0]![1])
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]![0], pts[i]![1])
    shape.closePath()
    // Extruded toward +Z (out of the page); the shape stays in the XY plane so
    // x = east/west and y = north/south read directly to the viewer. Front face
    // sits at z ≈ 0.16, where the market pins anchor.
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 1,
    })
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#dcd6cb" flatShading />
    </mesh>
  )
}

function MarketPillar({
  market,
  selected,
  onSelect,
}: {
  market: Market
  selected: boolean
  onSelect: (id: string) => void
}) {
  const ref = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const FRONT = 0.16 // front face of the extruded landmass (z)
  const pinLen = 0.22 + market.pressure * 0.5
  const active = hovered || selected

  // Smoothly extend the pin outward (+Z) when active.
  useFrame(() => {
    if (!ref.current) return
    const target = active ? 1.22 : 1
    ref.current.scale.z += (target - ref.current.scale.z) * 0.18
  })

  const color = useMemo(() => {
    // Cool (low) -> warm accent (high) by pressure.
    return new THREE.Color().lerpColors(
      new THREE.Color('#8aa1ad'),
      new THREE.Color('#c8553d'),
      market.pressure,
    )
  }, [market.pressure])

  return (
    <group position={[market.x, market.y, FRONT]}>
      <group
        ref={ref}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(market.id)
        }}
      >
        {/* Invisible, oversized hit cylinder along +Z so small mouse moves
            don't drop the hover (no flicker). */}
        <mesh position={[0, 0, (pinLen + 0.4) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, pinLen + 0.4, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Pin shaft sticking out of the map toward the viewer */}
        <mesh position={[0, 0, pinLen / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.06, pinLen, 10]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={active ? 0.55 : 0.18}
          />
        </mesh>
        {/* Pin head */}
        <mesh position={[0, 0, pinLen + 0.03]}>
          <sphereGeometry args={[selected ? 0.07 : 0.055, 14, 14]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={active ? 0.9 : 0.32}
          />
        </mesh>
      </group>

      {/* No distanceFactor: the card stays a fixed, small screen size (it
          doesn't balloon as the pin nears the camera). High, constant z-index
          keeps it above the canvas and neighbors. */}
      {active && (
        <Html
          position={[0, 0, pinLen + 0.24]}
          center
          zIndexRange={[100, 100]}
          style={{ pointerEvents: 'none' }}
        >
          <div className={`market-card ${selected ? 'market-card--pinned' : ''}`}>
            <strong className="market-card__name">{market.name}</strong>
            <div className="market-card__row">
              <span>Permits</span>
              <b>{market.stats.permits}</b>
            </div>
            <div className="market-card__row">
              <span>Land</span>
              <b>{market.stats.landTrend}</b>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
