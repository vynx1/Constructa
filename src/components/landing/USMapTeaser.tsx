import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { feature } from 'topojson-client'
import type { FeatureCollection } from 'geojson'
import type { Topology } from 'topojson-specification'
import * as THREE from 'three'
import {
  createUsProjection,
  featureToBorderRings,
  featureToShapes,
  filterConusStates,
  getConusNormalizedBounds,
  projectPoint,
  type ConusBounds,
} from '~/lib/usMapProjection'

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

/** Subtle extrusion tilt on the map mesh (not the camera pitch). */
const MAP_SURFACE_TILT = -0.28
const MAP_GROUP_OFFSET: [number, number, number] = [0, -0.04, 0]
const VIEW_PADDING = 1.22
const MAX_POLAR_ANGLE = Math.PI / 2
/** As flat as OrbitControls allows — one step above the hard limit. */
const INITIAL_POLAR_ANGLE = MAX_POLAR_ANGLE - 0.04

export interface Market {
  id: string
  name: string
  lon: number
  lat: number
  pressure: number
  stats: { permits: string; landTrend: string; note: string }
}

export const MARKETS: Market[] = [
  {
    id: 'sea',
    name: 'Seattle, WA',
    lon: -122.33,
    lat: 47.61,
    pressure: 0.62,
    stats: { permits: '+14% YoY', landTrend: '$210/sqft', note: 'Tech-led infill demand' },
  },
  {
    id: 'bay',
    name: 'Bay Area, CA',
    lon: -122.42,
    lat: 37.77,
    pressure: 0.78,
    stats: { permits: '+9% YoY', landTrend: '$430/sqft', note: 'High regulation, strong upside' },
  },
  {
    id: 'la',
    name: 'LA Basin, CA',
    lon: -118.24,
    lat: 34.05,
    pressure: 0.84,
    stats: { permits: '+18% YoY', landTrend: '$365/sqft', note: 'Infill lot splits surging' },
  },
  {
    id: 'phx',
    name: 'Phoenix, AZ',
    lon: -112.07,
    lat: 33.45,
    pressure: 0.9,
    stats: { permits: '+27% YoY', landTrend: '$120/sqft', note: 'Fastest permit velocity' },
  },
  {
    id: 'den',
    name: 'Denver, CO',
    lon: -104.99,
    lat: 39.74,
    pressure: 0.66,
    stats: { permits: '+11% YoY', landTrend: '$190/sqft', note: 'Front Range water limits' },
  },
  {
    id: 'atx',
    name: 'Austin, TX',
    lon: -97.74,
    lat: 30.27,
    pressure: 0.88,
    stats: { permits: '+24% YoY', landTrend: '$155/sqft', note: 'Low-friction approvals' },
  },
  {
    id: 'chi',
    name: 'Chicago, IL',
    lon: -87.63,
    lat: 41.88,
    pressure: 0.48,
    stats: { permits: '+4% YoY', landTrend: '$140/sqft', note: 'Adaptive-reuse plays' },
  },
  {
    id: 'atl',
    name: 'Atlanta, GA',
    lon: -84.39,
    lat: 33.75,
    pressure: 0.7,
    stats: { permits: '+16% YoY', landTrend: '$95/sqft', note: 'Sun Belt in-migration' },
  },
  {
    id: 'mia',
    name: 'Miami, FL',
    lon: -80.19,
    lat: 25.76,
    pressure: 0.74,
    stats: { permits: '+13% YoY', landTrend: '$280/sqft', note: 'Flood-zone overlays' },
  },
  {
    id: 'nyc',
    name: 'NYC Metro',
    lon: -74.01,
    lat: 40.71,
    pressure: 0.58,
    stats: { permits: '+6% YoY', landTrend: '$520/sqft', note: 'Dense, code-intensive' },
  },
]

interface MapSceneProps {
  states: FeatureCollection
  activeId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

function StateMeshes({
  states,
  projection,
}: {
  states: FeatureCollection
  projection: ReturnType<typeof createUsProjection>
}) {
  const stateData = useMemo(() => {
    return states.features.map((f) => ({
      id: String(f.id),
      shapes: featureToShapes(f, projection),
    }))
  }, [states, projection])

  return (
    <group>
      {stateData.map(({ id, shapes }) =>
        shapes.map((shape, i) => (
          <mesh key={`${id}-${i}`} receiveShadow castShadow>
            <extrudeGeometry args={[shape, { depth: 0.06, bevelEnabled: false }]} />
            <meshStandardMaterial color="#3d4f63" flatShading roughness={0.75} metalness={0.05} />
          </mesh>
        )),
      )}
    </group>
  )
}

function StateBorders({
  states,
  projection,
}: {
  states: FeatureCollection
  projection: ReturnType<typeof createUsProjection>
}) {
  const rings = useMemo(() => {
    return states.features.flatMap((f) => featureToBorderRings(f, projection, 0.067))
  }, [states, projection])

  return (
    <>
      {rings.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#6a849c"
          lineWidth={0.8}
          transparent
          opacity={0.65}
        />
      ))}
    </>
  )
}

function MarketPillar({
  market,
  position,
  active,
  onHover,
  onSelect,
}: {
  market: Market
  position: [number, number]
  active: boolean
  onHover: (hover: boolean) => void
  onSelect: () => void
}) {
  const ref = useRef<THREE.Group>(null)
  const pinLen = 0.06 + market.pressure * 0.2
  const FRONT = 0.07

  const color = useMemo(
    () =>
      new THREE.Color().lerpColors(
        new THREE.Color('#5a8a9e'),
        new THREE.Color('#f59e0b'),
        market.pressure,
      ),
    [market.pressure],
  )

  useFrame(() => {
    if (!ref.current) return
    const target = active ? 1.12 : 1
    ref.current.scale.z += (target - ref.current.scale.z) * 0.16
  })

  return (
    <group position={[position[0], position[1], FRONT]}>
      <group
        ref={ref}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          onHover(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <mesh position={[0, 0, (pinLen + 0.22) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, pinLen + 0.22, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, pinLen / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.026, pinLen, 12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={active ? 0.85 : 0.3}
          />
        </mesh>
        <mesh position={[0, 0, pinLen + 0.025]}>
          <sphereGeometry args={[active ? 0.034 : 0.026, 16, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={active ? 1.0 : 0.35}
          />
        </mesh>
      </group>
    </group>
  )
}

function MapOverviewControls({
  bounds,
}: {
  bounds: ConusBounds
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(MAP_SURFACE_TILT, 0, 0),
    )

    const localCorners = [
      new THREE.Vector3(bounds.minX, bounds.minY, 0),
      new THREE.Vector3(bounds.maxX, bounds.minY, 0),
      new THREE.Vector3(bounds.minX, bounds.maxY, 0),
      new THREE.Vector3(bounds.maxX, bounds.maxY, 0),
      new THREE.Vector3(bounds.minX, bounds.minY, 0.12),
      new THREE.Vector3(bounds.maxX, bounds.maxY, 0.12),
    ]

    const worldBox = new THREE.Box3()
    localCorners.forEach((corner) => {
      corner.applyQuaternion(quat)
      corner.add(new THREE.Vector3(...MAP_GROUP_OFFSET))
      worldBox.expandByPoint(corner)
    })

    const center = worldBox.getCenter(new THREE.Vector3())
    const sphere = worldBox.getBoundingSphere(new THREE.Sphere())
    const radius = sphere.radius

    const aspect = size.width / Math.max(size.height, 1)
    const fovV = (cam.fov * Math.PI) / 180
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect)
    const distV = radius / Math.tan(fovV / 2)
    const distH = radius / Math.tan(fovH / 2)
    const distance = Math.max(distV, distH) * VIEW_PADDING

    const azimuth = 0.04
    const polar = INITIAL_POLAR_ANGLE
    const offset = new THREE.Vector3(
      distance * Math.sin(polar) * Math.sin(azimuth),
      distance * Math.cos(polar),
      distance * Math.sin(polar) * Math.cos(azimuth),
    )

    cam.position.copy(center).add(offset)
    cam.lookAt(center)
    cam.near = 0.1
    cam.far = 50
    cam.updateProjectionMatrix()

    const ctrl = controlsRef.current
    if (ctrl) {
      ctrl.target.copy(center)
      ctrl.minDistance = distance * 0.7
      ctrl.maxDistance = distance * 1.32
      ctrl.minPolarAngle = 0.08
      ctrl.maxPolarAngle = MAX_POLAR_ANGLE
      ctrl.update()
    }
  }, [bounds, camera, size.width, size.height])

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.08}
      maxPolarAngle={MAX_POLAR_ANGLE}
    />
  )
}

function MapScene({ states, activeId, onHover, onSelect }: MapSceneProps) {
  const projection = useMemo(() => createUsProjection(states), [states])
  const bounds = useMemo(
    () => getConusNormalizedBounds(states, projection),
    [states, projection],
  )

  const marketPositions = useMemo(() => {
    return MARKETS.map((m) => {
      const p = projectPoint(projection, m.lon, m.lat)
      return { market: m, pos: p }
    }).filter((x): x is { market: Market; pos: [number, number] } => x.pos !== null)
  }, [projection])

  return (
    <>
      <color attach="background" args={['#0f1520']} />
      <PerspectiveCamera makeDefault fov={38} near={0.1} far={50} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[2, 5, 3]} intensity={1.25} castShadow />
      <directionalLight position={[-3, 2, 2]} intensity={0.4} />
      <fog attach="fog" args={['#0f1520', 4, 14]} />

      <group rotation={[MAP_SURFACE_TILT, 0, 0]} position={MAP_GROUP_OFFSET}>
        <StateMeshes states={states} projection={projection} />
        <StateBorders states={states} projection={projection} />
        {marketPositions.map(({ market, pos }) => (
          <MarketPillar
            key={market.id}
            market={market}
            position={pos}
            active={activeId === market.id}
            onHover={(h) => onHover(h ? market.id : null)}
            onSelect={() => onSelect(market.id)}
          />
        ))}
      </group>

      <MapOverviewControls bounds={bounds} />
    </>
  )
}

function MarketPanel({
  market,
  pinned,
}: {
  market: Market | undefined
  pinned: boolean
}) {
  const heightPct = market ? Math.round(market.pressure * 100) : 0

  return (
    <div
      className={`usmap-panel ${pinned ? 'usmap-panel--pinned' : ''} ${market ? '' : 'usmap-panel--empty'}`}
    >
      <div className="usmap-panel__header">
        <p className="usmap-panel__label font-mono">
          {market ? (pinned ? 'Pinned market' : 'Preview') : 'Market intel'}
        </p>
        <h3 className="usmap-panel__name">
          {market ? market.name : 'Select a market'}
        </h3>
      </div>

      <div className="usmap-panel__pressure">
        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-cyan-400">
          Dev. pressure
        </span>
        <div className="usmap-panel__bar">
          <div
            className="usmap-panel__bar-fill"
            style={{ width: market ? `${heightPct}%` : '0%' }}
          />
        </div>
        <span className="font-mono text-sm font-semibold text-[#e8edf2]">
          {market ? `${heightPct}%` : '—'}
        </span>
      </div>

      <dl className="usmap-panel__stats">
        <div>
          <dt>Permits</dt>
          <dd>{market?.stats.permits ?? 'Hover or click a metro below'}</dd>
        </div>
        <div>
          <dt>Land trend</dt>
          <dd>{market?.stats.landTrend ?? '—'}</dd>
        </div>
        <div className="usmap-panel__note">
          <dt>Intel</dt>
          <dd>{market?.stats.note ?? 'Choose a pillar on the map or pick from the metro list.'}</dd>
        </div>
      </dl>
    </div>
  )
}

export function USMapTeaser() {
  const [mounted, setMounted] = useState(false)
  const [states, setStates] = useState<FeatureCollection | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let cancelled = false
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (cancelled) return
        const statesObj = topo.objects.states
        if (!statesObj) return
        const raw = feature(topo, statesObj) as unknown as FeatureCollection
        setStates(filterConusStates(raw))
      })
      .catch(() => {
        if (!cancelled) setStates(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeId = selected ?? hovered
  const activeMarket = MARKETS.find((m) => m.id === activeId)

  if (!mounted) {
    return <div className="usmap usmap--poster" aria-hidden />
  }

  return (
    <div className="usmap-layout">
      <div className="usmap-layout__map">
        <div className="usmap">
          {states ? (
            <Canvas
              dpr={[1, 1.75]}
              shadows
              style={{ width: '100%', height: '100%', display: 'block' }}
              onPointerMissed={() => setSelected(null)}
            >
              <MapScene
                states={states}
                activeId={activeId}
                onHover={setHovered}
                onSelect={setSelected}
              />
            </Canvas>
          ) : (
            <div className="usmap usmap--loading">Loading map…</div>
          )}
          <p className="usmap__hint font-mono">Drag to rotate · scroll to zoom · click to pin</p>
        </div>
      </div>

      <aside className="usmap-layout__sidebar" aria-label="Market intelligence">
        <MarketPanel market={activeMarket} pinned={selected !== null && selected === activeId} />

        <div className="usmap-market-list">
          <p className="usmap-market-list__title font-mono">Metro markets</p>
          <ul className="usmap-market-list__items">
            {MARKETS.map((m) => {
              const isActive = activeId === m.id
              const isPinned = selected === m.id
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`usmap-market-list__btn ${isActive ? 'usmap-market-list__btn--active' : ''} ${isPinned ? 'usmap-market-list__btn--pinned' : ''}`}
                    onMouseEnter={() => setHovered(m.id)}
                    onMouseLeave={() =>
                      setHovered((h) => (h === m.id && !selected ? null : h))
                    }
                    onClick={() => setSelected((s) => (s === m.id ? null : m.id))}
                  >
                    <span
                      className="usmap-market-list__bar"
                      style={{ height: `${24 + m.pressure * 28}px` }}
                    />
                    <span className="usmap-market-list__text">
                      <span className="usmap-market-list__name">{m.name}</span>
                      <span className="usmap-market-list__meta font-mono">{m.stats.permits}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
    </div>
  )
}
