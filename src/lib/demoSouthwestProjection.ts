import { geoMercator, geoPath } from 'd3-geo'
import type { FeatureCollection } from 'geojson'

export interface SouthwestProjection {
  raw: ReturnType<typeof geoMercator>
  projectPoint(lon: number, lat: number): [number, number] | null
}

/** Southwest US in north-up Mercator view (640×320 SVG). */
export function createSouthwestProjection(collection: FeatureCollection): SouthwestProjection {
  const raw = geoMercator()

  raw.fitExtent(
    [
      [12, 12],
      [628, 308],
    ],
    collection,
  )

  const projectPoint = (lon: number, lat: number): [number, number] | null => {
    const p = raw([lon, lat])
    if (!p) return null
    return [p[0], p[1]]
  }

  return { raw, projectPoint }
}

export function southwestPath(collection: FeatureCollection) {
  const { raw } = createSouthwestProjection(collection)
  return geoPath(raw)
}
