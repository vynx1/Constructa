import { geoAlbersUsa, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'
import * as THREE from 'three'

/** Lower 48 + DC — exclude AK (02), HI (15), territories. */
const NON_CONUS_FIPS = new Set(['02', '15', '60', '66', '69', '72', '78'])

export interface NormalizedProjection {
  raw: ReturnType<typeof geoAlbersUsa>
  scale: number
  centerX: number
  centerY: number
}

export function filterConusStates(
  collection: FeatureCollection<Geometry, GeoJsonProperties>,
) {
  return {
    ...collection,
    features: collection.features.filter((f) => {
      const id = String(f.id ?? '')
      return !NON_CONUS_FIPS.has(id)
    }),
  }
}

/** Fit CONUS into ~2.2 Three.js units centered at the origin. */
export function createUsProjection(
  collection: FeatureCollection,
  targetSize = 2.2,
): NormalizedProjection {
  const raw = geoAlbersUsa()
  const path = geoPath(raw)
  const [[x0, y0], [x1, y1]] = path.bounds(collection)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const scale = targetSize / Math.max(x1 - x0, y1 - y0)

  return { raw, scale, centerX: cx, centerY: cy }
}

export interface ConusBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Axis-aligned bounds of CONUS in normalized scene units (Y north-up). */
export function getConusNormalizedBounds(
  collection: FeatureCollection,
  projection: NormalizedProjection,
): ConusBounds {
  const path = geoPath(projection.raw)
  const [[x0, y0], [x1, y1]] = path.bounds(collection)
  const { scale, centerX, centerY } = projection
  return {
    minX: (x0 - centerX) * scale,
    maxX: (x1 - centerX) * scale,
    minY: -(y1 - centerY) * scale,
    maxY: -(y0 - centerY) * scale,
  }
}

export function projectPoint(
  projection: NormalizedProjection,
  lon: number,
  lat: number,
): [number, number] | null {
  const p = projection.raw([lon, lat])
  if (!p) return null
  return [
    (p[0] - projection.centerX) * projection.scale,
    -(p[1] - projection.centerY) * projection.scale,
  ]
}

function ringToShape(
  ring: number[][],
  projection: NormalizedProjection,
): THREE.Shape | null {
  if (ring.length < 3) return null
  const shape = new THREE.Shape()
  let started = false

  ring.forEach((coord) => {
    const lon = coord[0]
    const lat = coord[1]
    if (lon === undefined || lat === undefined) return
    const p = projectPoint(projection, lon, lat)
    if (!p) return
    if (!started) {
      shape.moveTo(p[0], p[1])
      started = true
    } else {
      shape.lineTo(p[0], p[1])
    }
  })

  if (!started) return null
  shape.closePath()
  return shape
}

export function featureToShapes(
  feature: Feature,
  projection: NormalizedProjection,
): THREE.Shape[] {
  const { geometry } = feature
  const shapes: THREE.Shape[] = []

  if (geometry.type === 'Polygon') {
    const outer = ringToShape(geometry.coordinates[0]!, projection)
    if (outer) {
      for (let h = 1; h < geometry.coordinates.length; h++) {
        const hole = ringToShape(geometry.coordinates[h]!, projection)
        if (hole) outer.holes.push(hole)
      }
      shapes.push(outer)
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      const outer = ringToShape(poly[0]!, projection)
      if (outer) {
        for (let h = 1; h < poly.length; h++) {
          const hole = ringToShape(poly[h]!, projection)
          if (hole) outer.holes.push(hole)
        }
        shapes.push(outer)
      }
    }
  }

  return shapes
}

export function featureToBorderRings(
  feature: Feature,
  projection: NormalizedProjection,
  z: number,
): THREE.Vector3[][] {
  const rings: THREE.Vector3[][] = []

  const addRing = (ring: number[][]) => {
    const pts: THREE.Vector3[] = []
    ring.forEach((coord) => {
      const lon = coord[0]
      const lat = coord[1]
      if (lon === undefined || lat === undefined) return
      const p = projectPoint(projection, lon, lat)
      if (p) pts.push(new THREE.Vector3(p[0], p[1], z))
    })
    if (pts.length > 1) rings.push(pts)
  }

  const { geometry } = feature
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(addRing)
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly) => poly.forEach(addRing))
  }

  return rings
}
