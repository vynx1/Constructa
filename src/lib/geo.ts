// Pure geometry helpers (no DOM, safe on server or client). Used by the map
// frontend to (a) clip the dense heatmap to a state's real outline and (b)
// carve a state polygon into vertical "congressional region" strips with
// straight dividing lines.

export type Ring = [number, number][]
export type Polygon = Ring[] // [outer, ...holes]

/** Ray-casting point-in-polygon against a single ring (ignores holes). */
export function pointInRing(pt: [number, number], ring: Ring): boolean {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Point-in-polygon across a GeoJSON geometry (Polygon or MultiPolygon). */
export function pointInGeometry(pt: [number, number], geometry: any): boolean {
  if (!geometry) return false
  const polys: Polygon[] =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]
  for (const poly of polys) {
    // Inside outer ring AND not inside any hole.
    if (poly[0] && pointInRing(pt, poly[0] as Ring)) {
      let inHole = false
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(pt, poly[h] as Ring)) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

/** Bounding box [minLng, minLat, maxLng, maxLat] of a GeoJSON geometry. */
export function geometryBBox(geometry: any): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  const walk = (coords: any) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    } else {
      for (const c of coords) walk(c)
    }
  }
  walk(geometry.coordinates)
  return [minX, minY, maxX, maxY]
}

// --- Sutherland–Hodgman clip of a ring against a vertical strip [xMin,xMax] ---
function clipRingByLine(
  ring: Ring,
  keep: (p: [number, number]) => boolean,
  intersect: (a: [number, number], b: [number, number]) => [number, number],
): Ring {
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i]!
    const prev = ring[(i + ring.length - 1) % ring.length]!
    const curIn = keep(cur)
    const prevIn = keep(prev)
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (prevIn) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

/** Clip one ring to a vertical strip; returns [] if fully outside. */
export function clipRingToStrip(ring: Ring, xMin: number, xMax: number): Ring {
  const interpX = (a: [number, number], b: [number, number], x: number): [number, number] => {
    const t = (x - a[0]) / (b[0] - a[0])
    return [x, a[1] + t * (b[1] - a[1])]
  }
  let r = clipRingByLine(
    ring,
    (p) => p[0] >= xMin,
    (a, b) => interpX(a, b, xMin),
  )
  if (r.length < 3) return []
  r = clipRingByLine(
    r,
    (p) => p[0] <= xMax,
    (a, b) => interpX(a, b, xMax),
  )
  return r.length < 3 ? [] : r
}

/**
 * Carve a state geometry into a vertical strip [xMin,xMax], returning a
 * GeoJSON MultiPolygon geometry that hugs the original outline. This produces
 * the straight congressional-region dividing lines while keeping the state's
 * real top/bottom/left/right borders.
 */
export function clipGeometryToStrip(geometry: any, xMin: number, xMax: number): any {
  const polys: Polygon[] =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]
  const outPolys: number[][][][] = []
  for (const poly of polys) {
    const clippedOuter = clipRingToStrip(poly[0] as Ring, xMin, xMax)
    if (clippedOuter.length >= 3) outPolys.push([clippedOuter])
  }
  return { type: 'MultiPolygon', coordinates: outPolys }
}
