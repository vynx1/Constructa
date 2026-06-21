import Redis from 'ioredis'

// Server-only. Lazily creates a single shared ioredis client. If REDIS_URL is
// unset the client is null and callers fall back to mock/cached data so the
// app stays runnable without infrastructure.
let client: Redis | null = null

export function getRedis(): Redis | null {
  if (client) return client
  // Trim defensively: a stray trailing tab / wrapping quote in .env silently
  // corrupts the credentials and surfaces as a "NOAUTH" error at first command.
  const url = process.env.REDIS_URL?.trim().replace(/^["']|["']$/g, '')
  if (!url) return null
  client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 })
  client.on('error', (err) => {
    console.error('[redis] connection error:', err.message)
  })
  return client
}

// Centralized key design — see BUILD_PLAN §6 + the Map System master plan §3A.
export const keys = {
  project: (id: string) => `project:${id}`,
  projectSequence: (id: string) => `project:${id}:sequence`,
  projectCurrentStep: (id: string) => `project:${id}:current_step`,
  projectRedesign: (id: string) => `project:${id}:redesign`,
  ragCodes: () => `rag:codes`,
  ragDistrict: (id: string) => `rag:district:${id}`,
  claudeCache: (hash: string) => `cache:claude:${hash}`,
  mapCounty: (fips: string) => `map:county:${fips}`,

  // --- Interactive map + deep-dive workspace (master plan §3A) ---
  // map:state:{code}            -> Hash: { aggregate_score, regulatory_density }
  mapState: (code: string) => `map:state:${code}`,
  // map:district:{id}           -> JSON: { center, regional_name, aggregate_consensus_score }
  mapDistrict: (id: string) => `map:district:${id}`,
  // map:district:{id}:grids     -> JSON: [ { coordinates:[x,y], score } ]
  mapDistrictGrids: (id: string) => `map:district:${id}:grids`,
  // session:{id}:raw_scrapes    -> List: raw Browserbase text blocks
  sessionRawScrapes: (id: string) => `session:${id}:raw_scrapes`,
  // cache:asi:guide:{hash}      -> String: compiled buying-guide JSON
  asiGuide: (hash: string) => `cache:asi:guide:${hash}`,
  // data:pre_generated:cache:{district} -> String: frozen guide for stage-safe mode
  preGeneratedGuide: (district: string) => `data:pre_generated:cache:${district}`,

  // --- Granular (zip-level) heatmap + congressional regions ---
  // map:state:{code}:cells   -> JSON: dense zip-level cells [{coordinates,score,zip,region}]
  mapStateCells: (code: string) => `map:state:${code}:cells`,
  // map:state:{code}:regions -> JSON: congressional-region scores [{id,label,score,zips}]
  mapStateRegions: (code: string) => `map:state:${code}:regions`,
  // map:region:{id}          -> JSON: region detail + buying guide
  mapRegion: (id: string) => `map:region:${id}`,
  // map:region:{id}:listings -> JSON: Browserbase land-for-sale listings
  regionListings: (id: string) => `map:region:${id}:listings`,
  // liked:plots              -> Hash: { listingId: JSON } saved by the user
  likedPlots: () => `liked:plots`,
  // map:region:{id}:partners -> JSON: BrowserBase local contractor/business list
  regionPartners: (id: string) => `map:region:${id}:partners`,
} as const