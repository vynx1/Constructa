import { MousePointer2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection } from 'geojson'
import type { Topology } from 'topojson-specification'
import { createSouthwestProjection } from '~/lib/demoSouthwestProjection'

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'
const SW_FIPS = new Set(['04', '06', '08', '32', '35', '49'])

const SD_LON = -117.1611
const SD_LAT = 32.7157
const PHX_LON = -112.07
const PHX_LAT = 33.45
const LA_LON = -118.24
const LA_LAT = 34.05

const VIEW_W = 640
const VIEW_H = 320
const ZOOM_SCALE = 2.75
/** Must match demo click timer and map phase length. */
export const DEMO_CURSOR_TRAVEL_MS = 2600
/** Pause on SD parcel after click before the demo advances to INIT. */
export const MAP_HOLD_AFTER_CLICK_MS = 1500

type Point = { x: number; y: number }

/** Map viewBox coords → pixel position inside the letterboxed SVG container. */
function viewBoxToContainer(
  vx: number,
  vy: number,
  containerW: number,
  containerH: number,
): Point {
  const scale = Math.min(containerW / VIEW_W, containerH / VIEW_H)
  const renderedW = VIEW_W * scale
  const renderedH = VIEW_H * scale
  const offsetX = (containerW - renderedW) / 2
  const offsetY = (containerH - renderedH) / 2
  return {
    x: offsetX + vx * scale,
    y: offsetY + vy * scale,
  }
}

/** Pixel start on the far right of the demo frame, above the target. */
function cursorStartPixels(containerW: number, end: Point): Point {
  return {
    x: Math.max(end.x + 100, containerW * 0.84),
    y: Math.max(20, end.y - 55),
  }
}

function runCursorDrag(
  container: HTMLDivElement,
  cursor: HTMLDivElement,
  parcel: [number, number],
) {
  const { width, height } = container.getBoundingClientRect()
  if (width <= 0 || height <= 0) return

  const end = viewBoxToContainer(parcel[0], parcel[1], width, height)
  const start = cursorStartPixels(width, end)

  cursor.style.left = `${start.x}px`
  cursor.style.top = `${start.y}px`

  const anim = cursor.animate(
    [
      { left: `${start.x}px`, top: `${start.y}px` },
      { left: `${end.x}px`, top: `${end.y}px` },
    ],
    {
      duration: DEMO_CURSOR_TRAVEL_MS,
      fill: 'forwards',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  )

  return anim
}

function TopoLines() {
  const lines = useMemo(() => {
    const paths: string[] = []
    for (let i = 0; i < 14; i++) {
      const y = 40 + i * 16
      const amp = 8 + (i % 4) * 3
      paths.push(
        `M 20 ${y} Q 120 ${y - amp} 220 ${y + amp * 0.4} T 420 ${y - amp * 0.6} T 620 ${y + amp * 0.3}`,
      )
    }
    for (let i = 0; i < 10; i++) {
      const x = 60 + i * 55
      paths.push(
        `M ${x} 30 Q ${x + 20} 120 ${x - 10} 210 T ${x + 15} 290`,
      )
    }
    return paths
  }, [])

  return (
    <g className="demo-sw-map__topo" aria-hidden>
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(120, 160, 190, 0.12)" strokeWidth="0.6" />
      ))}
    </g>
  )
}

function HeatLayer({
  phx,
  la,
  sd,
}: {
  phx: [number, number] | null
  la: [number, number] | null
  sd: [number, number] | null
}) {
  return (
    <g aria-hidden>
      <defs>
        <radialGradient id="heat-phx" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(245, 158, 11, 0.45)" />
          <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
        </radialGradient>
        <radialGradient id="heat-la" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(251, 191, 36, 0.35)" />
          <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
        </radialGradient>
        <radialGradient id="heat-sd" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(245, 158, 11, 0.55)" />
          <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
        </radialGradient>
      </defs>
      {phx && <ellipse cx={phx[0]} cy={phx[1]} rx={72} ry={56} fill="url(#heat-phx)" />}
      {la && <ellipse cx={la[0]} cy={la[1]} rx={58} ry={46} fill="url(#heat-la)" />}
      {sd && <ellipse cx={sd[0]} cy={sd[1]} rx={48} ry={38} fill="url(#heat-sd)" />}
    </g>
  )
}

export function DemoSouthwestMap({
  active,
  clicked,
  fading,
}: {
  active: boolean
  clicked: boolean
  fading: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<Animation | null>(null)
  const dragStartedRef = useRef(false)
  const [states, setStates] = useState<FeatureCollection | null>(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (cancelled) return
        const statesObj = topo.objects.states
        if (!statesObj) return
        const raw = feature(topo, statesObj) as unknown as FeatureCollection
        setStates({
          ...raw,
          features: raw.features.filter((f) => SW_FIPS.has(String(f.id ?? ''))),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const parcelCoords = useMemo((): [number, number] | null => {
    if (!states) return null
    const proj = createSouthwestProjection(states)
    return proj.projectPoint(SD_LON, SD_LAT)
  }, [states])

  const { paths, phx, la, sd, zoomTransform } = useMemo(() => {
    if (!states) {
      return {
        paths: [] as string[],
        phx: null as [number, number] | null,
        la: null as [number, number] | null,
        sd: null as [number, number] | null,
        zoomTransform: undefined as string | undefined,
      }
    }
    const proj = createSouthwestProjection(states)
    const pathGen = geoPath(proj.raw)
    const pathList = states.features
      .map((f) => pathGen(f))
      .filter((d): d is string => Boolean(d))
    const pt = proj.projectPoint(SD_LON, SD_LAT)
    const transform =
      pt && zoomed
        ? `translate(${VIEW_W / 2 - pt[0] * ZOOM_SCALE} ${VIEW_H / 2 - pt[1] * ZOOM_SCALE}) scale(${ZOOM_SCALE})`
        : undefined
    return {
      paths: pathList,
      phx: proj.projectPoint(PHX_LON, PHX_LAT),
      la: proj.projectPoint(LA_LON, LA_LAT),
      sd: pt,
      zoomTransform: transform,
    }
  }, [states, zoomed])

  useLayoutEffect(() => {
    if (!active) {
      dragStartedRef.current = false
      animationRef.current?.cancel()
      animationRef.current = null
      return
    }

    const container = containerRef.current
    const cursor = cursorRef.current
    if (!container || !cursor || !parcelCoords || dragStartedRef.current) return

    dragStartedRef.current = true
    const anim = runCursorDrag(container, cursor, parcelCoords)
    if (anim) animationRef.current = anim

    return () => {
      animationRef.current?.cancel()
      animationRef.current = null
    }
  }, [active, parcelCoords])

  useEffect(() => {
    if (!clicked) {
      setZoomed(false)
      return
    }
    const zoomId = window.setTimeout(() => setZoomed(true), 280)
    return () => window.clearTimeout(zoomId)
  }, [clicked])

  return (
    <div
      ref={containerRef}
      className={`demo-sw-map relative h-full min-h-0 overflow-hidden rounded-xl border border-white/10 transition-all duration-500 ease-in-out ${
        fading ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}
      aria-hidden={!active}
    >
      <div className="demo-sw-map__bg absolute inset-0" aria-hidden />

      <svg
        className="demo-sw-map__svg absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g
          className="demo-sw-map__zoom"
          style={
            zoomTransform
              ? ({ transform: zoomTransform } as CSSProperties)
              : undefined
          }
        >
          <TopoLines />
          <HeatLayer phx={phx} la={la} sd={sd} />

          <g className="demo-sw-map__states">
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="rgba(36, 52, 72, 0.85)"
                stroke="rgba(110, 145, 175, 0.35)"
                strokeWidth={0.55}
                className="demo-sw-map__state"
              />
            ))}
          </g>

          {parcelCoords && (
            <>
              <rect
                x={parcelCoords[0] - 14}
                y={parcelCoords[1] - 10}
                width={28}
                height={20}
                rx={2}
                fill={clicked ? 'rgba(245, 158, 11, 0.35)' : 'rgba(255, 255, 255, 0.06)'}
                stroke={clicked ? '#f59e0b' : 'rgba(148, 163, 184, 0.55)'}
                strokeWidth={clicked ? 1.5 : 0.8}
                className={clicked ? 'demo-parcel-glow' : ''}
              />
              {clicked && (
                <>
                  <circle cx={parcelCoords[0]} cy={parcelCoords[1]} r={3} fill="#f59e0b" />
                  <circle cx={parcelCoords[0]} cy={parcelCoords[1]} r={8} fill="none" stroke="#f59e0b" strokeWidth={0.8} opacity={0.6}>
                    <animate attributeName="r" from="8" to="22" dur="1.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
            </>
          )}
        </g>
      </svg>

      {active && parcelCoords && (
        <div
          ref={cursorRef}
          className={`demo-cursor demo-cursor--sd ${clicked ? 'demo-cursor--landed' : ''}`}
        >
          <MousePointer2 className="h-5 w-5 text-amber-300 drop-shadow-sm" strokeWidth={2} />
        </div>
      )}
    </div>
  )
}
