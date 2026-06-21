// Client-side fetchers + types for the interactive map. Thin wrappers over the
// /api/map/* routes; designed for use with TanStack Query in the map page.

export {
  scoreColor,
  scoreColorCss,
  colorForScore,
  colorForScoreCss,
  toRelativeScore,
  scoreExtent,
  legendGradientCss,
  LEGEND_TICKS,
  COLOR_STOPS,
} from '~/lib/mapScores'

export interface StateScore {
  code: string
  name: string
  aggregateScore: number
  regulatoryDensity: number
  districts: string[]
}

export interface HeatCell {
  coordinates: [number, number]
  score: number
  zip: string
  region: string
}

export interface CongressRegion {
  id: string
  code: string
  index: number
  label: string
  score: number
  center: [number, number]
  xMin: number
  xMax: number
  zips: string[]
  city: string
  number?: number
}

export interface ScoredDistrict extends CongressRegion {
  number: number
  geometry?: GeoJSON.Geometry
}

export interface LandListing {
  id: string
  title: string
  zip: string
  price: string
  pricePerAcre: string
  acreage: string
  zone: string
  lat: number
  lng: number
  images: string[]
  imageUnavailable?: boolean
  sources: { title: string; url: string }[]
}

export interface GuideFactor {
  key: string
  label: string
  score: number
  reasoning: string
  sources: { title: string; url: string }[]
}

export interface BuyRecommendation {
  verdict: 'buy' | 'hold' | 'avoid'
  headline: string
  reasoning: string
}

export interface BuyingGuide {
  district: string
  recommendation: BuyRecommendation
  factors: GuideFactor[]
  consensusScore: number
  zoning: string
  permits: string
  crowd_demands: string
  testimonials: string
  source: string
}

export interface RegionDeepDive {
  regionId: string
  region: CongressRegion
  guide: BuyingGuide
  listings: LandListing[]
  live: boolean
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

export const mapClient = {
  states: () =>
    getJson<{ source: string; states: StateScore[] }>('/api/map/states'),

  heatmap: (code: string) =>
    getJson<{ code: string; cells: HeatCell[] }>(`/api/map/state/${code}/heatmap`),

  regions: (code: string) =>
    getJson<{ code: string; regions: CongressRegion[] }>(
      `/api/map/state/${code}/regions`,
    ),

  congressionalDistricts: (code: string) =>
    getJson<{
      code: string
      districts: ScoredDistrict[]
      geojson: GeoJSON.FeatureCollection
    }>(`/api/map/state/${code}/congressional-districts`),

  counties: (code: string) =>
    getJson<{ code: string; geojson: GeoJSON.FeatureCollection }>(
      `/api/map/state/${code}/counties`,
    ),

  // Region deep-dive: live mode opt-in via header.
  regionDeepDive: async (
    regionId: string,
    opts: { live?: boolean } = {},
  ): Promise<RegionDeepDive> => {
    const res = await fetch(`/api/map/region/${regionId}/deep-dive`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-live-mode': opts.live ? 'true' : 'false',
      },
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`region deep-dive ${res.status}`)
    return res.json()
  },

  liked: () =>
    getJson<{ liked: LandListing[]; source: string }>('/api/map/liked'),

  like: (listing: LandListing) =>
    fetch('/api/map/liked', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(listing),
    }).then((r) => r.json()),

  unlike: (id: string) =>
    fetch(`/api/map/liked/${id}`, { method: 'DELETE' }).then((r) => r.json()),
}

