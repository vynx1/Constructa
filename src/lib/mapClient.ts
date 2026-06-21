// Client-side fetchers + types for the interactive map. Thin wrappers over the
// /api/map/* routes; designed for use with TanStack Query in the map page.

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

// Shared consensus → color ramp. Diverging red→sand→green, tuned to read like a
// stock-trading heatmap (Finviz): low consensus = red (bearish), mid = neutral
// sand, high = green (bullish). Color maps DIRECTLY to the 0–100 score, so two
// tiles of different color always represent different consensus.
const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [178, 34, 40]], // deep red
  [25, [216, 78, 62]], // red
  [42, [226, 146, 96]], // orange
  [50, [222, 199, 142]], // neutral sand
  [58, [150, 196, 122]], // pale green
  [75, [74, 167, 94]], // green
  [100, [22, 110, 58]], // deep green
]

export function scoreColor(score: number): [number, number, number] {
  const s = Math.max(0, Math.min(100, score))
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [s0, c0] = COLOR_STOPS[i]!
    const [s1, c1] = COLOR_STOPS[i + 1]!
    if (s <= s1) {
      const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ]
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1]![1]
}

export function scoreColorCss(score: number, alpha = 1): string {
  const [r, g, b] = scoreColor(score)
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}
