// Load congressional district + county boundaries.
// Districts: unitedstates/districts (2012 vintage GeoJSON per CD).
// Counties: us-atlas TopoJSON (cached after first fetch).

import { feature } from 'topojson-client'
import { fipsForState, districtId } from '~/lib/stateFips'
import { geometryBBox } from '~/lib/geo'

const CD_INDEX_URL =
  'https://api.github.com/repos/unitedstates/districts/contents/cds/2012'
const CD_GEO_BASE =
  'https://raw.githubusercontent.com/unitedstates/districts/gh-pages/cds/2012'
const COUNTY_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'

let cdIndex: string[] | null = null
let countyTopo: any = null
const districtCache = new Map<string, GeoJSON.FeatureCollection>()

async function loadCdIndex(): Promise<string[]> {
  if (cdIndex) return cdIndex
  const res = await fetch(CD_INDEX_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`CD index fetch failed: ${res.status}`)
  const items = (await res.json()) as { name: string }[]
  cdIndex = items.map((x) => x.name).filter((n) => /^[A-Z]{2}-\d+$/.test(n))
  return cdIndex
}

async function countyTopology(): Promise<any> {
  if (countyTopo) return countyTopo
  const res = await fetch(COUNTY_URL)
  if (!res.ok) throw new Error(`County topo fetch failed: ${res.status}`)
  countyTopo = await res.json()
  return countyTopo
}

function parseUsDistrictId(id: string): { code: string; number: number } | null {
  const m = id.match(/^([A-Z]{2})-(\d+)$/)
  if (!m) return null
  return { code: m[1]!, number: parseInt(m[2]!, 10) }
}

export interface DistrictFeature {
  type: 'Feature'
  properties: {
    id: string
    code: string
    number: number
    label: string
    sourceId: string
  }
  geometry: GeoJSON.Geometry
}

/** Congressional district polygons for a state. */
export async function congressionalDistrictsForState(
  codeRaw: string,
): Promise<{ type: 'FeatureCollection'; features: DistrictFeature[] }> {
  const code = codeRaw.toUpperCase()
  const cached = districtCache.get(code)
  if (cached) return cached as { type: 'FeatureCollection'; features: DistrictFeature[] }

  const index = await loadCdIndex()
  const ids = index.filter((id) => id.startsWith(`${code}-`))
  if (!ids.length) return { type: 'FeatureCollection', features: [] }

  const features: DistrictFeature[] = []
  // Fetch in small batches to avoid hammering GitHub raw CDN.
  const BATCH = 8
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (sourceId) => {
        const parsed = parseUsDistrictId(sourceId)
        if (!parsed) return null
        try {
          const res = await fetch(`${CD_GEO_BASE}/${sourceId}/shape.geojson`)
          if (!res.ok) return null
          const raw = await res.json()
          let geometry: GeoJSON.Geometry | undefined
          if (raw.type === 'Feature') geometry = raw.geometry
          else if (raw.type === 'FeatureCollection') geometry = raw.features?.[0]?.geometry
          else if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') geometry = raw
          if (!geometry) return null
          return {
            type: 'Feature' as const,
            properties: {
              id: districtId(code, parsed.number),
              code,
              number: parsed.number,
              label: `${code} · District ${parsed.number}`,
              sourceId,
            },
            geometry,
          }
        } catch {
          return null
        }
      }),
    )
    features.push(...results.filter(Boolean) as DistrictFeature[])
  }

  features.sort((a, b) => a.properties.number - b.properties.number)
  const fc = { type: 'FeatureCollection' as const, features }
  districtCache.set(code, fc)
  return fc
}

/** County boundary lines for a state (for overlay when drilled in). */
export async function countiesForState(
  codeRaw: string,
): Promise<GeoJSON.FeatureCollection> {
  const code = codeRaw.toUpperCase()
  const fips = fipsForState(code)
  if (!fips) return { type: 'FeatureCollection', features: [] }

  const topo = await countyTopology()
  const collection = feature(topo, topo.objects.counties as any) as unknown as GeoJSON.FeatureCollection

  const features = collection.features.filter((f) => {
    const id = String(f.id ?? '').padStart(5, '0')
    return id.startsWith(fips)
  })

  return { type: 'FeatureCollection', features }
}

export function districtCentroid(geometry: GeoJSON.Geometry): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = geometryBBox(geometry)
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
}
