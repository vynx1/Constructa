// ---------------------------------------------------------------------------
// Seed map data for the interactive choropleth + deep-dive workspace.
//
// This is the cache-backed "frozen record" set the master plan §4 calls for:
// state-level aggregate scores, metro-district groupings, per-district grids,
// properties for sale, and a pre-generated buying guide so the entire flow is
// demoable offline. In production these shapes are written to Redis by the
// offline Browserbase + ASI:One scoring pass (BUILD_PLAN §4) and served from
// `map:state:*` / `map:district:*`.
//
// Non-buildable land (tribal / military / protected) is excluded BEFORE scoring
// per BUILD_PLAN §4 — reflected here as a lower `buildablePct`.
// ---------------------------------------------------------------------------

export interface StateScore {
  code: string // USPS code, joins to GeoJSON `STATE`/`name`
  name: string
  aggregateScore: number // 0..100 construction-consensus score
  regulatoryDensity: number // 0..100, higher = more red tape
  districts: string[] // metro-district ids drillable from this state
}

export interface GridCell {
  coordinates: [number, number] // [lng, lat]
  score: number // 0..100
}

export interface PropertyListing {
  id: string
  title: string
  img: string
  cost: string
  zone: string
  acreage: string
}

export interface DistrictGuide {
  zoning: string
  permits: string
  crowd_demands: string
  testimonials: string
}

export interface District {
  id: string
  stateId: string
  regionalName: string
  center: [number, number] // [lng, lat]
  aggregateConsensusScore: number
  buildablePct: number // share of land left after non-buildable exclusion
  cities: string[]
  grids: GridCell[]
  properties: PropertyListing[]
  guide: DistrictGuide
}

// --- State-level scores (national heatmap) ---------------------------------
export const STATE_SCORES: Record<string, StateScore> = {
  CA: {
    code: 'CA',
    name: 'California',
    aggregateScore: 64,
    regulatoryDensity: 88,
    districts: ['ca-sd', 'ca-la', 'ca-bay'],
  },
  AZ: {
    code: 'AZ',
    name: 'Arizona',
    aggregateScore: 86,
    regulatoryDensity: 38,
    districts: ['az-phx'],
  },
  TX: {
    code: 'TX',
    name: 'Texas',
    aggregateScore: 82,
    regulatoryDensity: 30,
    districts: ['tx-aus'],
  },
  CO: {
    code: 'CO',
    name: 'Colorado',
    aggregateScore: 71,
    regulatoryDensity: 52,
    districts: ['co-den'],
  },
  WA: {
    code: 'WA',
    name: 'Washington',
    aggregateScore: 60,
    regulatoryDensity: 70,
    districts: ['wa-sea'],
  },

  // --- Hardcoded "live" scores for the remaining states so the national map
  // is never blank (ask #3). These states drill into congressional regions +
  // heatmaps (generated in mapGeo.ts) but don't have curated metro districts.
  AL: stateScore('AL', 'Alabama', 79, 34),
  AK: stateScore('AK', 'Alaska', 58, 46),
  AR: stateScore('AR', 'Arkansas', 80, 31),
  CT: stateScore('CT', 'Connecticut', 52, 74),
  DE: stateScore('DE', 'Delaware', 66, 55),
  FL: stateScore('FL', 'Florida', 83, 44),
  GA: stateScore('GA', 'Georgia', 81, 40),
  HI: stateScore('HI', 'Hawaii', 41, 86),
  ID: stateScore('ID', 'Idaho', 85, 33),
  IL: stateScore('IL', 'Illinois', 62, 63),
  IN: stateScore('IN', 'Indiana', 78, 38),
  IA: stateScore('IA', 'Iowa', 77, 36),
  KS: stateScore('KS', 'Kansas', 80, 32),
  KY: stateScore('KY', 'Kentucky', 75, 41),
  LA: stateScore('LA', 'Louisiana', 70, 47),
  ME: stateScore('ME', 'Maine', 63, 58),
  MD: stateScore('MD', 'Maryland', 55, 71),
  MA: stateScore('MA', 'Massachusetts', 50, 80),
  MI: stateScore('MI', 'Michigan', 69, 52),
  MN: stateScore('MN', 'Minnesota', 67, 55),
  MS: stateScore('MS', 'Mississippi', 78, 30),
  MO: stateScore('MO', 'Missouri', 79, 35),
  MT: stateScore('MT', 'Montana', 82, 30),
  NE: stateScore('NE', 'Nebraska', 80, 33),
  NH: stateScore('NH', 'New Hampshire', 68, 49),
  NJ: stateScore('NJ', 'New Jersey', 49, 78),
  NM: stateScore('NM', 'New Mexico', 77, 38),
  NY: stateScore('NY', 'New York', 51, 82),
  NC: stateScore('NC', 'North Carolina', 80, 42),
  ND: stateScore('ND', 'North Dakota', 83, 28),
  OH: stateScore('OH', 'Ohio', 72, 48),
  OK: stateScore('OK', 'Oklahoma', 82, 30),
  OR: stateScore('OR', 'Oregon', 58, 72),
  PA: stateScore('PA', 'Pennsylvania', 64, 57),
  RI: stateScore('RI', 'Rhode Island', 48, 76),
  SC: stateScore('SC', 'South Carolina', 81, 39),
  SD: stateScore('SD', 'South Dakota', 84, 27),
  TN: stateScore('TN', 'Tennessee', 84, 33),
  UT: stateScore('UT', 'Utah', 85, 35),
  VT: stateScore('VT', 'Vermont', 60, 62),
  VA: stateScore('VA', 'Virginia', 73, 50),
  WV: stateScore('WV', 'West Virginia', 71, 44),
  WI: stateScore('WI', 'Wisconsin', 70, 51),
  WY: stateScore('WY', 'Wyoming', 83, 29),
  NV: stateScore('NV', 'Nevada', 84, 36),
}

function stateScore(
  code: string,
  name: string,
  aggregateScore: number,
  regulatoryDensity: number,
): StateScore {
  return { code, name, aggregateScore, regulatoryDensity, districts: [] }
}

// Build a synthetic grid of scored cells around a district center so the
// district-level heatmap has something to render. Deterministic per center.
function makeGrid(center: [number, number], base: number): GridCell[] {
  const [lng, lat] = center
  const cells: GridCell[] = []
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const jitter = ((i * 7 + j * 13 + 100) % 30) - 15
      cells.push({
        coordinates: [lng + i * 0.12, lat + j * 0.1],
        score: Math.max(5, Math.min(98, base + jitter)),
      })
    }
  }
  return cells
}

const placeholderImg = (label: string) =>
  `https://placehold.co/480x300/1a1916/f7f5f1?text=${encodeURIComponent(label)}`

export const DISTRICTS: Record<string, District> = {
  'ca-sd': {
    id: 'ca-sd',
    stateId: 'CA',
    regionalName: 'San Diego',
    center: [-117.16, 32.72],
    aggregateConsensusScore: 68,
    buildablePct: 0.74,
    cities: ['San Diego', 'Chula Vista', 'Oceanside', 'Escondido'],
    grids: makeGrid([-117.16, 32.72], 68),
    properties: [
      {
        id: 'sd-1',
        title: 'Otay Mesa mixed-use parcel',
        img: placeholderImg('Otay Mesa'),
        cost: '$1.4M',
        zone: 'MU-3 mixed-use',
        acreage: '0.8 ac',
      },
      {
        id: 'sd-2',
        title: 'North Park infill lot',
        img: placeholderImg('North Park'),
        cost: '$890K',
        zone: 'RM-2 residential',
        acreage: '0.3 ac',
      },
      {
        id: 'sd-3',
        title: 'Kearny Mesa commercial pad',
        img: placeholderImg('Kearny Mesa'),
        cost: '$2.1M',
        zone: 'CC-3 commercial',
        acreage: '1.2 ac',
      },
    ],
    guide: {
      zoning:
        'Mostly MU-3 / RM-2 with strong infill provisions; ~26% excluded (tribal + coastal).',
      permits: 'Permit velocity ~38 days, trending faster QoQ. CEQA infill exemptions common.',
      crowd_demands:
        'Positive sentiment on transit-oriented density; some coastal-height opposition.',
      testimonials:
        '"Plan check moved quicker than LA, but coastal review adds weeks." — local GC',
    },
  },
  'ca-la': {
    id: 'ca-la',
    stateId: 'CA',
    regionalName: 'LA / Irvine Split',
    center: [-118.0, 33.9],
    aggregateConsensusScore: 59,
    buildablePct: 0.81,
    cities: ['Los Angeles', 'Irvine', 'Long Beach', 'Anaheim'],
    grids: makeGrid([-118.0, 33.9], 59),
    properties: [
      {
        id: 'la-1',
        title: 'Irvine Spectrum flex parcel',
        img: placeholderImg('Irvine'),
        cost: '$3.6M',
        zone: 'MU mixed-use',
        acreage: '1.5 ac',
      },
      {
        id: 'la-2',
        title: 'DTLA adaptive-reuse lot',
        img: placeholderImg('DTLA'),
        cost: '$4.2M',
        zone: 'C2 commercial',
        acreage: '0.9 ac',
      },
    ],
    guide: {
      zoning: 'SB-9 lot splits surging; dense overlay zones. ~19% excluded.',
      permits: 'Permit velocity slower (~62 days); RFI-heavy plan check.',
      crowd_demands: 'Mixed — pro-housing groups vs. neighborhood-preservation pushback.',
      testimonials: '"Worth it for the market, but budget for plan-check rounds." — developer',
    },
  },
  'ca-bay': {
    id: 'ca-bay',
    stateId: 'CA',
    regionalName: 'Bay Area',
    center: [-122.2, 37.6],
    aggregateConsensusScore: 55,
    buildablePct: 0.69,
    cities: ['San Francisco', 'Oakland', 'San Jose', 'Fremont'],
    grids: makeGrid([-122.2, 37.6], 55),
    properties: [
      {
        id: 'bay-1',
        title: 'Oakland transit-adjacent parcel',
        img: placeholderImg('Oakland'),
        cost: '$2.8M',
        zone: 'CBD-X mixed',
        acreage: '0.6 ac',
      },
    ],
    guide: {
      zoning: 'High CEQA exposure; ~31% excluded (bay fill + protected). Upside on approved sites.',
      permits: 'Slowest velocity (~74 days); strong exemption value if eligible.',
      crowd_demands: 'High-profile opposition common; long discretionary review.',
      testimonials: '"Entitlement is the whole game here." — entitlement consultant',
    },
  },
  'az-phx': {
    id: 'az-phx',
    stateId: 'AZ',
    regionalName: 'Phoenix Metro',
    center: [-112.07, 33.45],
    aggregateConsensusScore: 89,
    buildablePct: 0.92,
    cities: ['Phoenix', 'Mesa', 'Scottsdale', 'Gilbert'],
    grids: makeGrid([-112.07, 33.45], 89),
    properties: [
      {
        id: 'phx-1',
        title: 'Gilbert greenfield parcel',
        img: placeholderImg('Gilbert'),
        cost: '$1.1M',
        zone: 'PAD planned',
        acreage: '3.4 ac',
      },
    ],
    guide: {
      zoning: 'Abundant PAD / greenfield; minimal exclusions (~8%).',
      permits: 'Fastest velocity (~21 days); by-right paths common.',
      crowd_demands: 'Strongly pro-development; water adequacy is the main scrutiny.',
      testimonials: '"Fastest permits we pull anywhere." — regional builder',
    },
  },
  'tx-aus': {
    id: 'tx-aus',
    stateId: 'TX',
    regionalName: 'Austin Metro',
    center: [-97.74, 30.27],
    aggregateConsensusScore: 84,
    buildablePct: 0.88,
    cities: ['Austin', 'Round Rock', 'Pflugerville'],
    grids: makeGrid([-97.74, 30.27], 84),
    properties: [
      {
        id: 'aus-1',
        title: 'East Austin mixed-use lot',
        img: placeholderImg('East Austin'),
        cost: '$1.7M',
        zone: 'CS-MU',
        acreage: '0.7 ac',
      },
    ],
    guide: {
      zoning: 'Flexible CS-MU; light exclusions (~12%, watershed).',
      permits: 'Moderate-fast velocity (~30 days) post site-plan reform.',
      crowd_demands: 'Pro-growth; affordability + traffic are recurring themes.',
      testimonials: '"Site plan got faster after the code rewrite." — local architect',
    },
  },
  'co-den': {
    id: 'co-den',
    stateId: 'CO',
    regionalName: 'Denver Front Range',
    center: [-104.99, 39.74],
    aggregateConsensusScore: 70,
    buildablePct: 0.83,
    cities: ['Denver', 'Aurora', 'Lakewood'],
    grids: makeGrid([-104.99, 39.74], 70),
    properties: [],
    guide: {
      zoning: 'Mixed urban infill; ~17% excluded (open space + water).',
      permits: 'Moderate velocity (~45 days); water-tap availability gates some sites.',
      crowd_demands: 'Generally supportive; Front Range water limits are the live debate.',
      testimonials: '"Confirm water taps before you close." — Denver developer',
    },
  },
  'wa-sea': {
    id: 'wa-sea',
    stateId: 'WA',
    regionalName: 'Seattle Metro',
    center: [-122.33, 47.61],
    aggregateConsensusScore: 61,
    buildablePct: 0.72,
    cities: ['Seattle', 'Bellevue', 'Tacoma'],
    grids: makeGrid([-122.33, 47.61], 61),
    properties: [],
    guide: {
      zoning: 'Upzoning underway; ~28% excluded (critical areas + water).',
      permits: 'Slower velocity (~58 days); design review adds time.',
      crowd_demands: 'Tech-led demand; design-review and tree-code debates persist.',
      testimonials: '"Design review is the long pole." — Seattle GC',
    },
  },
}

export function getDistrict(id: string): District | undefined {
  return DISTRICTS[id]
}

export function getStateScore(code: string): StateScore | undefined {
  return STATE_SCORES[code.toUpperCase()]
}

export function districtsForState(code: string): District[] {
  const s = getStateScore(code)
  if (!s) return []
  return s.districts
    .map((d) => DISTRICTS[d])
    .filter((d): d is District => Boolean(d))
}
