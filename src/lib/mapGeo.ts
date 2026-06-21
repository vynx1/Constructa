// ---------------------------------------------------------------------------
// Server-side generation of the granular (zip-level) heatmap and the
// congressional-region partition for a state. Deterministic per state so the
// map looks identical every load. When Redis holds real cells/regions
// (`map:state:{code}:cells` / `:regions`) the API serves those instead — this
// is the "fill the heatmap once data is in Redis" path; this module is the
// seeded fallback that makes it work offline.
// ---------------------------------------------------------------------------

export interface HeatCell {
  coordinates: [number, number] // [lng, lat]
  score: number // 0..100
  zip: string
  region: string // region id this cell belongs to
}

export interface CongressRegion {
  id: string // e.g. "CA-r3"
  code: string // state code
  index: number // 0-based strip index, west→east
  label: string // "California · District 4"
  score: number // 0..100 aggregate
  center: [number, number]
  xMin: number // longitude band (for frontend strip-clipping)
  xMax: number
  zips: string[] // real zips for the nearest real cities in this band
  city: string // representative city/area name for this region
}

// Approximate state bounding boxes [minLng, minLat, maxLng, maxLat] + a leading
// ZIP prefix for plausible synthetic zips. Approximate is fine — the frontend
// clips cells to the real outline.
const STATE_META: Record<
  string,
  { name: string; bbox: [number, number, number, number]; zip3: number; cds: number }
> = {
  AL: { name: 'Alabama', bbox: [-88.5, 30.2, -84.9, 35.0], zip3: 350, cds: 7 },
  AK: { name: 'Alaska', bbox: [-170.0, 54.0, -130.0, 71.5], zip3: 995, cds: 1 },
  AZ: { name: 'Arizona', bbox: [-114.8, 31.3, -109.0, 37.0], zip3: 850, cds: 9 },
  AR: { name: 'Arkansas', bbox: [-94.6, 33.0, -89.6, 36.5], zip3: 720, cds: 4 },
  CA: { name: 'California', bbox: [-124.4, 32.5, -114.1, 42.0], zip3: 900, cds: 8 },
  CO: { name: 'Colorado', bbox: [-109.1, 37.0, -102.0, 41.0], zip3: 800, cds: 8 },
  CT: { name: 'Connecticut', bbox: [-73.7, 40.9, -71.8, 42.05], zip3: 60, cds: 5 },
  DE: { name: 'Delaware', bbox: [-75.8, 38.4, -75.0, 39.8], zip3: 197, cds: 1 },
  FL: { name: 'Florida', bbox: [-87.6, 24.5, -80.0, 31.0], zip3: 320, cds: 8 },
  GA: { name: 'Georgia', bbox: [-85.6, 30.3, -80.8, 35.0], zip3: 300, cds: 8 },
  HI: { name: 'Hawaii', bbox: [-160.3, 18.9, -154.8, 22.3], zip3: 968, cds: 2 },
  ID: { name: 'Idaho', bbox: [-117.2, 42.0, -111.0, 49.0], zip3: 836, cds: 2 },
  IL: { name: 'Illinois', bbox: [-91.5, 37.0, -87.0, 42.5], zip3: 600, cds: 8 },
  IN: { name: 'Indiana', bbox: [-88.1, 37.8, -84.8, 41.8], zip3: 460, cds: 7 },
  IA: { name: 'Iowa', bbox: [-96.6, 40.4, -90.1, 43.5], zip3: 500, cds: 4 },
  KS: { name: 'Kansas', bbox: [-102.1, 37.0, -94.6, 40.0], zip3: 660, cds: 4 },
  KY: { name: 'Kentucky', bbox: [-89.6, 36.5, -81.9, 39.1], zip3: 400, cds: 6 },
  LA: { name: 'Louisiana', bbox: [-94.0, 28.9, -88.8, 33.0], zip3: 700, cds: 6 },
  ME: { name: 'Maine', bbox: [-71.1, 43.0, -66.9, 47.5], zip3: 40, cds: 2 },
  MD: { name: 'Maryland', bbox: [-79.5, 37.9, -75.0, 39.7], zip3: 209, cds: 8 },
  MA: { name: 'Massachusetts', bbox: [-73.5, 41.2, -69.9, 42.9], zip3: 20, cds: 8 },
  MI: { name: 'Michigan', bbox: [-90.4, 41.7, -82.4, 48.3], zip3: 480, cds: 7 },
  MN: { name: 'Minnesota', bbox: [-97.2, 43.5, -89.5, 49.4], zip3: 550, cds: 8 },
  MS: { name: 'Mississippi', bbox: [-91.7, 30.2, -88.1, 35.0], zip3: 386, cds: 4 },
  MO: { name: 'Missouri', bbox: [-95.8, 36.0, -89.1, 40.6], zip3: 630, cds: 8 },
  MT: { name: 'Montana', bbox: [-116.1, 44.4, -104.0, 49.0], zip3: 590, cds: 2 },
  NE: { name: 'Nebraska', bbox: [-104.1, 40.0, -95.3, 43.0], zip3: 680, cds: 3 },
  NV: { name: 'Nevada', bbox: [-120.0, 35.0, -114.0, 42.0], zip3: 890, cds: 4 },
  NH: { name: 'New Hampshire', bbox: [-72.6, 42.7, -70.6, 45.3], zip3: 30, cds: 2 },
  NJ: { name: 'New Jersey', bbox: [-75.6, 38.9, -73.9, 41.4], zip3: 80, cds: 8 },
  NM: { name: 'New Mexico', bbox: [-109.1, 31.3, -103.0, 37.0], zip3: 870, cds: 3 },
  NY: { name: 'New York', bbox: [-79.8, 40.5, -71.9, 45.0], zip3: 100, cds: 8 },
  NC: { name: 'North Carolina', bbox: [-84.4, 33.8, -75.4, 36.6], zip3: 270, cds: 8 },
  ND: { name: 'North Dakota', bbox: [-104.1, 45.9, -96.6, 49.0], zip3: 580, cds: 1 },
  OH: { name: 'Ohio', bbox: [-84.9, 38.4, -80.5, 42.0], zip3: 430, cds: 8 },
  OK: { name: 'Oklahoma', bbox: [-103.0, 33.6, -94.4, 37.0], zip3: 730, cds: 5 },
  OR: { name: 'Oregon', bbox: [-124.6, 41.9, -116.5, 46.3], zip3: 970, cds: 6 },
  PA: { name: 'Pennsylvania', bbox: [-80.5, 39.7, -74.7, 42.3], zip3: 150, cds: 8 },
  RI: { name: 'Rhode Island', bbox: [-71.9, 41.1, -71.1, 42.0], zip3: 28, cds: 2 },
  SC: { name: 'South Carolina', bbox: [-83.4, 32.0, -78.5, 35.2], zip3: 290, cds: 7 },
  SD: { name: 'South Dakota', bbox: [-104.1, 42.5, -96.4, 45.9], zip3: 570, cds: 1 },
  TN: { name: 'Tennessee', bbox: [-90.3, 35.0, -81.6, 36.7], zip3: 370, cds: 8 },
  TX: { name: 'Texas', bbox: [-106.6, 25.8, -93.5, 36.5], zip3: 750, cds: 8 },
  UT: { name: 'Utah', bbox: [-114.1, 37.0, -109.0, 42.0], zip3: 840, cds: 4 },
  VT: { name: 'Vermont', bbox: [-73.4, 42.7, -71.5, 45.0], zip3: 50, cds: 1 },
  VA: { name: 'Virginia', bbox: [-83.7, 36.5, -75.2, 39.5], zip3: 220, cds: 8 },
  WA: { name: 'Washington', bbox: [-124.8, 45.5, -116.9, 49.0], zip3: 980, cds: 8 },
  WV: { name: 'West Virginia', bbox: [-82.6, 37.2, -77.7, 40.6], zip3: 250, cds: 2 },
  WI: { name: 'Wisconsin', bbox: [-92.9, 42.5, -86.8, 47.1], zip3: 530, cds: 8 },
  WY: { name: 'Wyoming', bbox: [-111.1, 41.0, -104.1, 45.0], zip3: 820, cds: 1 },
}

// Curated real cities (name + a real zip + coords) per state. A region picks
// the cities geographically NEAREST its band center, so listings come from the
// right part of the state instead of always the biggest metro (the "LA for all
// of California" bug). Add states as needed; uncurated states fall back to a
// generated zip from the state's leading prefix.
interface CityRef {
  name: string
  zip: string
  lng: number
  lat: number
}

const STATE_CITIES: Record<string, CityRef[]> = {
  CA: [
    { name: 'Eureka', zip: '95501', lng: -124.16, lat: 40.8 },
    { name: 'Redding', zip: '96001', lng: -122.37, lat: 40.59 },
    { name: 'Santa Rosa', zip: '95404', lng: -122.72, lat: 38.44 },
    { name: 'San Francisco', zip: '94103', lng: -122.41, lat: 37.77 },
    { name: 'Sacramento', zip: '95814', lng: -121.49, lat: 38.58 },
    { name: 'San Jose', zip: '95113', lng: -121.89, lat: 37.34 },
    { name: 'Modesto', zip: '95354', lng: -120.99, lat: 37.64 },
    { name: 'Fresno', zip: '93721', lng: -119.79, lat: 36.74 },
    { name: 'Bakersfield', zip: '93301', lng: -119.02, lat: 35.37 },
    { name: 'Bishop', zip: '93514', lng: -118.4, lat: 37.36 },
    { name: 'Los Angeles', zip: '90012', lng: -118.24, lat: 34.05 },
    { name: 'Barstow', zip: '92311', lng: -117.02, lat: 34.9 },
    { name: 'Palm Springs', zip: '92262', lng: -116.54, lat: 33.83 },
    { name: 'El Centro', zip: '92243', lng: -115.56, lat: 32.79 },
    { name: 'San Diego', zip: '92101', lng: -117.16, lat: 32.72 },
  ],
  AZ: [
    { name: 'Phoenix', zip: '85003', lng: -112.07, lat: 33.45 },
    { name: 'Tucson', zip: '85701', lng: -110.97, lat: 32.22 },
    { name: 'Flagstaff', zip: '86001', lng: -111.65, lat: 35.2 },
    { name: 'Yuma', zip: '85364', lng: -114.62, lat: 32.69 },
    { name: 'Kingman', zip: '86401', lng: -114.05, lat: 35.19 },
    { name: 'Show Low', zip: '85901', lng: -110.03, lat: 34.25 },
  ],
  TX: [
    { name: 'Houston', zip: '77002', lng: -95.37, lat: 29.76 },
    { name: 'Dallas', zip: '75201', lng: -96.8, lat: 32.78 },
    { name: 'Austin', zip: '78701', lng: -97.74, lat: 30.27 },
    { name: 'San Antonio', zip: '78205', lng: -98.49, lat: 29.42 },
    { name: 'El Paso', zip: '79901', lng: -106.49, lat: 31.76 },
    { name: 'Lubbock', zip: '79401', lng: -101.85, lat: 33.58 },
    { name: 'Amarillo', zip: '79101', lng: -101.83, lat: 35.22 },
    { name: 'Corpus Christi', zip: '78401', lng: -97.4, lat: 27.8 },
  ],
  CO: [
    { name: 'Denver', zip: '80202', lng: -104.99, lat: 39.74 },
    { name: 'Colorado Springs', zip: '80903', lng: -104.82, lat: 38.83 },
    { name: 'Grand Junction', zip: '81501', lng: -108.55, lat: 39.06 },
    { name: 'Fort Collins', zip: '80521', lng: -105.08, lat: 40.59 },
    { name: 'Pueblo', zip: '81003', lng: -104.61, lat: 38.27 },
    { name: 'Durango', zip: '81301', lng: -107.88, lat: 37.27 },
  ],
  WA: [
    { name: 'Seattle', zip: '98101', lng: -122.33, lat: 47.61 },
    { name: 'Spokane', zip: '99201', lng: -117.43, lat: 47.66 },
    { name: 'Tacoma', zip: '98402', lng: -122.44, lat: 47.25 },
    { name: 'Yakima', zip: '98901', lng: -120.51, lat: 46.6 },
    { name: 'Vancouver', zip: '98660', lng: -122.67, lat: 45.63 },
    { name: 'Bellingham', zip: '98225', lng: -122.48, lat: 48.75 },
  ],
  NV: [
    { name: 'Las Vegas', zip: '89101', lng: -115.14, lat: 36.17 },
    { name: 'Reno', zip: '89501', lng: -119.81, lat: 39.53 },
    { name: 'Elko', zip: '89801', lng: -115.76, lat: 40.83 },
    { name: 'Carson City', zip: '89701', lng: -119.77, lat: 39.16 },
  ],
  OR: [
    { name: 'Portland', zip: '97201', lng: -122.68, lat: 45.52 },
    { name: 'Eugene', zip: '97401', lng: -123.09, lat: 44.05 },
    { name: 'Bend', zip: '97701', lng: -121.31, lat: 44.06 },
    { name: 'Medford', zip: '97501', lng: -122.87, lat: 42.33 },
    { name: 'Salem', zip: '97301', lng: -123.04, lat: 44.94 },
  ],
  UT: [
    { name: 'Salt Lake City', zip: '84101', lng: -111.89, lat: 40.76 },
    { name: 'Provo', zip: '84601', lng: -111.66, lat: 40.23 },
    { name: 'St. George', zip: '84770', lng: -113.58, lat: 37.1 },
    { name: 'Moab', zip: '84532', lng: -109.55, lat: 38.57 },
    { name: 'Logan', zip: '84321', lng: -111.83, lat: 41.74 },
  ],
  NY: [
    { name: 'New York', zip: '10001', lng: -73.99, lat: 40.75 },
    { name: 'Buffalo', zip: '14202', lng: -78.88, lat: 42.89 },
    { name: 'Albany', zip: '12207', lng: -73.75, lat: 42.65 },
    { name: 'Rochester', zip: '14604', lng: -77.61, lat: 43.16 },
    { name: 'Syracuse', zip: '13202', lng: -76.15, lat: 43.05 },
    { name: 'Binghamton', zip: '13901', lng: -75.91, lat: 42.1 },
  ],
  FL: [
    { name: 'Miami', zip: '33101', lng: -80.2, lat: 25.78 },
    { name: 'Orlando', zip: '32801', lng: -81.38, lat: 28.54 },
    { name: 'Tampa', zip: '33602', lng: -82.46, lat: 27.95 },
    { name: 'Jacksonville', zip: '32202', lng: -81.66, lat: 30.33 },
    { name: 'Tallahassee', zip: '32301', lng: -84.28, lat: 30.44 },
    { name: 'Fort Myers', zip: '33901', lng: -81.87, lat: 26.64 },
  ],
}

/** Cities in a state nearest to a band center, sorted closest-first. */
function nearestCities(code: string, center: [number, number], k = 3): CityRef[] {
  const cities = STATE_CITIES[code]
  if (!cities?.length) return []
  const [cx, cy] = center
  return [...cities]
    .sort(
      (a, b) =>
        (a.lng - cx) ** 2 + (a.lat - cy) ** 2 - ((b.lng - cx) ** 2 + (b.lat - cy) ** 2),
    )
    .slice(0, k)
}

// Deterministic hash so generation is stable across reloads.
function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

export function regionCount(code: string): number {
  const meta = STATE_META[code]
  if (!meta) return 5
  return Math.max(3, Math.min(8, meta.cds)) // cap strips for readability
}

export function hasStateMeta(code: string): boolean {
  return Boolean(STATE_META[code?.toUpperCase()])
}

function zipFor(code: string, regionIndex: number, n: number): string {
  const meta = STATE_META[code]
  const base = (meta?.zip3 ?? 100) * 100
  const val = base + regionIndex * 7 + n * 13
  return String(val % 100000).padStart(5, '0')
}

/** Congressional-region partition with aggregate scores. */
export function generateStateRegions(codeRaw: string): CongressRegion[] {
  const code = codeRaw.toUpperCase()
  const meta = STATE_META[code]
  if (!meta) return []
  const [minLng, minLat, maxLng, maxLat] = meta.bbox
  const R = regionCount(code)
  const w = (maxLng - minLng) / R
  const midLat = (minLat + maxLat) / 2
  const regions: CongressRegion[] = []
  for (let i = 0; i < R; i++) {
    const s = seedOf(`${code}:region:${i}`)
    const score = Math.round(34 + s * 60) // 34..94
    const xMin = minLng + i * w
    const xMax = minLng + (i + 1) * w
    const center: [number, number] = [(xMin + xMax) / 2, midLat]
    // Real zips from the cities nearest this band — geographically correct.
    const near = nearestCities(code, center, 4)
    const zips = near.length
      ? near.map((c) => c.zip)
      : Array.from({ length: 4 }, (_, n) => zipFor(code, i, n))
    const city = near[0]?.name ?? meta.name
    regions.push({
      id: `${code}-r${i + 1}`,
      code,
      index: i,
      label: `${meta.name} · District ${i + 1}`,
      score,
      center,
      xMin,
      xMax,
      zips,
      city,
    })
  }
  return regions
}

/**
 * Dense zip-level cell grid across the state bbox. The frontend clips these to
 * the real state outline. High resolution (60×40 ≈ 2400 cells) + multi-octave
 * value noise → a smooth, finely-varying field the frontend then contrast-
 * stretches so small score differences read as clear color changes.
 */
export function generateStateCells(codeRaw: string): HeatCell[] {
  const code = codeRaw.toUpperCase()
  const meta = STATE_META[code]
  if (!meta) return []
  const [minLng, minLat, maxLng, maxLat] = meta.bbox
  const regions = generateStateRegions(code)
  const R = regions.length
  const cols = 60
  const rows = 40
  const seed = seedOf(code) * 10
  const cells: HeatCell[] = []
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const lng = minLng + ((cx + 0.5) / cols) * (maxLng - minLng)
      const lat = minLat + ((cy + 0.5) / rows) * (maxLat - minLat)
      const fx = cx / cols
      const ri = Math.min(R - 1, Math.floor(fx * R))
      const region = regions[ri]!
      // Blend toward the neighboring band's score so strip seams are smooth.
      const within = fx * R - ri // 0..1 position inside the strip
      const dir = within > 0.5 ? 1 : -1
      const neighbor = regions[Math.max(0, Math.min(R - 1, ri + dir))]!
      const blendT = Math.abs(within - 0.5) // 0 at strip center → 0.5 at seam
      const blended = region.score * (1 - blendT) + neighbor.score * blendT
      // Multi-octave value noise (smooth large swells + finer detail).
      const noise =
        13 * Math.sin(lng * 1.1 + seed) +
        9 * Math.cos(lat * 1.4 + seed * 1.3) +
        5 * Math.sin((lng + lat) * 2.2 + seed * 0.7) +
        3 * Math.cos(lng * 3.3 - lat * 2.1 + seed)
      const score = Math.max(2, Math.min(99, Math.round(blended + noise)))
      cells.push({
        coordinates: [lng, lat],
        score,
        zip: region.zips[(cx * rows + cy) % region.zips.length] ?? region.zips[0]!,
        region: region.id,
      })
    }
  }
  return cells
}

export function stateBBox(
  codeRaw: string,
): [number, number, number, number] | null {
  return STATE_META[codeRaw?.toUpperCase()]?.bbox ?? null
}
