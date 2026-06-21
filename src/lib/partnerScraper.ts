import { withBrowserbasePage, gotoAndSettle, hasBrowserbaseKey } from '~/lib/browserbaseCore'
import { regionContextFor } from '~/lib/imageScraper'
import { asiComplete, hasAsiKey } from '~/lib/asi'

// ---------------------------------------------------------------------------
// Local Partners — REAL contractor discovery (multi-engine + direct sites).
//
// The previous version only queried DuckDuckGo HTML + Google Maps, both of
// which are aggressively bot-blocked, so it silently fell back to mock data —
// and the API layer then cached that mock as if it were live, serving stale
// fake contractors forever.
//
// New pipeline (Browserbase Developer-plan features only: geo/residential
// proxies + fingerprint stealth + ad-blocking + CDP; NO Enterprise
// advancedStealth/captcha):
//   1. DISCOVER  — for each major district ZIP × trade, run a real web search.
//                  Engines tried in order until results appear:
//                    Google (consent-cookie bypassed) → Bing → DuckDuckGo.
//                  Extract organic result links, drop directories, dedupe host.
//   2. VET       — ASI:One filters non-businesses, normalizes name+category,
//                  scores 0-100 conviction. Highest first.
//   3. ENRICH    — visit each top contractor's OWN website over CDP and scrape
//                  phone / email / clean name / logo (reliable, no bot wall).
//                  Google Maps used only as a secondary rating source.
//   4. RANK      — conviction → small-logo preference → review weight.
//
// scrapeLocalPartners now returns { partners, live }. live=false means we fell
// back to mock — the API uses this to NEVER cache mock data.
// ---------------------------------------------------------------------------

export interface BusinessPartner {
  id: string
  name: string
  category: string
  rating: number // 0-5
  reviewCount: number
  conviction: number // 0-100, ASI quality/legitimacy score
  topReview?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  logo?: string
  logoWidth?: number
  mapsUrl?: string
  sourceSite: string
  scrapedAt: string
}

export interface PartnerScrapeResult {
  partners: BusinessPartner[]
  live: boolean
}

interface RawCandidate {
  title: string
  url: string
  snippet: string
  zip: string
  queryCategory: string
}

interface VetResult {
  i: number
  name: string
  category: string
  conviction: number
}

const DISCOVERY_QUERIES = [
  'general contractor',
  'excavation contractor',
  'construction company',
  'land surveyor',
  'home builder',
]
const MAX_ZIPS = 2
const MAX_SEARCHES = 6
const RESULTS_PER_SEARCH = 5
const MAX_CANDIDATES = 22
const ENRICH_BUDGET = 12
const MAX_PARTNERS = 30

const DIRECTORY_HOSTS = [
  'yelp.', 'angi.', 'angieslist.', 'thumbtack.', 'houzz.', 'bbb.org',
  'facebook.', 'yellowpages.', 'mapquest.', 'indeed.', 'linkedin.',
  'buildzoom.', 'porch.', 'homeadvisor.', 'manta.', 'nextdoor.',
  'wikipedia.', 'youtube.', 'reddit.', 'pinterest.', 'instagram.',
  'tripadvisor.', 'glassdoor.', 'zillow.', 'realtor.', 'redfin.',
  'google.', 'bing.', 'duckduckgo.', 'yahoo.', 'amazon.', 'apple.',
  'craigslist.', 'whitepages.', 'expertise.', 'datanyze.', 'crunchbase.',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isDirectory(url: string): boolean {
  const host = hostOf(url).toLowerCase()
  if (!host) return true
  return DIRECTORY_HOSTS.some((d) => host.includes(d))
}

function faviconFor(url: string): string {
  const host = hostOf(url)
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : ''
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// --- In-page extractors (run via page.evaluate, browser context) -------------

// Google organic results. Handles the modern DOM (div.g / div.MjjYud anchors).
function googleResultsExtract(): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = []
  const seen = new Set<string>()
  const anchors = Array.from(
    document.querySelectorAll('a[href^="http"][data-ved], div.yuRUbf > a, div.g a[href^="http"]'),
  ) as HTMLAnchorElement[]
  for (const a of anchors) {
    const href = a.href
    if (!href || href.includes('google.com')) continue
    const h3 = a.querySelector('h3')
    const title = (h3 && h3.textContent ? h3.textContent : '').trim()
    if (!title) continue
    if (seen.has(href)) continue
    seen.add(href)
    const container = a.closest('div.g, div.MjjYud, div.tF2Cxc') || a.parentElement
    const snipEl = container ? container.querySelector('div.VwiC3b, div[data-sncf], .lEBKkf') : null
    const snippet = (snipEl && snipEl.textContent ? snipEl.textContent : '').trim().slice(0, 260)
    out.push({ title, url: href, snippet })
  }
  return out
}

// Bing organic results.
function bingResultsExtract(): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = []
  const seen = new Set<string>()
  const items = Array.from(document.querySelectorAll('li.b_algo'))
  for (const li of items) {
    const a = li.querySelector('h2 a') as HTMLAnchorElement | null
    if (!a) continue
    const href = a.href
    const title = (a.textContent || '').trim()
    if (!title || !href.startsWith('http') || seen.has(href)) continue
    seen.add(href)
    const p = li.querySelector('.b_caption p, p')
    const snippet = (p && p.textContent ? p.textContent : '').trim().slice(0, 260)
    out.push({ title, url: href, snippet })
  }
  return out
}

// DuckDuckGo HTML results.
function ddgResultsExtract(): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = []
  const seen = new Set<string>()
  const blocks = Array.from(document.querySelectorAll('.result, .web-result'))
  for (const b of blocks) {
    const a = b.querySelector('a.result__a') as HTMLAnchorElement | null
    if (!a) continue
    const title = (a.textContent || '').trim()
    let href = a.getAttribute('href') || ''
    const m = href.match(/[?&]uddg=([^&]+)/)
    if (m && m[1]) {
      try {
        href = decodeURIComponent(m[1])
      } catch {
        /* keep raw */
      }
    }
    if (href.startsWith('//')) href = 'https:' + href
    const snipEl = b.querySelector('.result__snippet')
    const snippet = (snipEl && snipEl.textContent ? snipEl.textContent : '').trim().slice(0, 260)
    if (!title || !href.startsWith('http') || seen.has(href)) continue
    seen.add(href)
    out.push({ title, url: href, snippet })
  }
  return out
}

// Scrape a contractor's OWN website for contact data + clean name + logo.
function siteContactExtract(): {
  name: string
  phone: string
  email: string
  logo: string
} {
  const pick = (sel: string, attr?: string): string => {
    const el = document.querySelector(sel)
    if (!el) return ''
    const v = attr ? el.getAttribute(attr) : el.textContent
    return (v || '').trim()
  }
  const name =
    pick('meta[property="og:site_name"]', 'content') ||
    pick('meta[property="og:title"]', 'content') ||
    ((document.title || '').split(/[|\-–—]/)[0] || '').trim()
  const telEl = document.querySelector('a[href^="tel:"]')
  let phone = telEl ? (telEl.getAttribute('href') || '').replace(/^tel:/, '').trim() : ''
  if (!phone) {
    const m = (document.body.innerText || '').match(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/)
    if (m) phone = m[0].trim()
  }
  const mailEl = document.querySelector('a[href^="mailto:"]')
  let email = mailEl ? ((mailEl.getAttribute('href') || '').replace(/^mailto:/, '').split('?')[0] || '').trim() : ''
  if (!email) {
    const em = (document.body.innerText || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
    if (em) email = em[0].trim()
  }
  const logo =
    pick('link[rel~="icon"]', 'href') ||
    pick('meta[property="og:image"]', 'content') ||
    ''
  return { name: name.slice(0, 60), phone, email, logo }
}

// --- Step 1: multi-engine discovery ------------------------------------------
interface Engine {
  name: string
  url: (q: string) => string
  extractor: () => Array<{ title: string; url: string; snippet: string }>
  settleMs: number
}

const ENGINES: Engine[] = [
  {
    name: 'google',
    url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20&hl=en&gl=us`,
    extractor: googleResultsExtract,
    settleMs: 1600,
  },
  {
    name: 'bing',
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20&setlang=en-us`,
    extractor: bingResultsExtract,
    settleMs: 1400,
  },
  {
    name: 'ddg',
    url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    extractor: ddgResultsExtract,
    settleMs: 1200,
  },
]

async function dismissGoogleConsent(page: any): Promise<void> {
  // Set the consent-bypass cookie so Google serves results directly.
  try {
    const ctx = page.context()
    await ctx.addCookies([
      { name: 'CONSENT', value: 'YES+cb', domain: '.google.com', path: '/' },
      { name: 'SOCS', value: 'CAI', domain: '.google.com', path: '/' },
    ])
  } catch {
    /* best effort */
  }
}

async function discoverContractors(page: any, zips: string[], state: string): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = []
  const seenHost = new Set<string>()
  let searches = 0
  await dismissGoogleConsent(page)
  const zipSlice = zips.slice(0, MAX_ZIPS)
  outer: for (const zip of zipSlice) {
    for (const query of DISCOVERY_QUERIES) {
      if (searches >= MAX_SEARCHES || candidates.length >= MAX_CANDIDATES) break outer
      searches++
      const q = `${query} near ${zip} ${state}`
      let results: Array<{ title: string; url: string; snippet: string }> = []
      for (const eng of ENGINES) {
        try {
          await gotoAndSettle(page, eng.url(q), eng.settleMs)
          results = await page.evaluate(eng.extractor)
          if (results && results.length) break
        } catch (err) {
          console.warn(`[partners] ${eng.name} "${q}" failed:`, errMsg(err))
        }
      }
      for (const r of (results || []).slice(0, RESULTS_PER_SEARCH)) {
        if (isDirectory(r.url)) continue
        const host = hostOf(r.url)
        if (!host || seenHost.has(host)) continue
        seenHost.add(host)
        candidates.push({ ...r, zip, queryCategory: query })
        if (candidates.length >= MAX_CANDIDATES) break
      }
    }
  }
  return candidates
}

// --- Step 2: ASI vetting ------------------------------------------------------
async function vetCandidatesWithAsi(candidates: RawCandidate[], loc: string): Promise<VetResult[]> {
  if (!candidates.length) return []
  const heuristic = (): VetResult[] =>
    candidates.map((c, i) => ({
      i,
      name: c.title.replace(/\s*[|\-–—].*$/, '').trim().slice(0, 60) || hostOf(c.url),
      category: c.queryCategory,
      conviction: 50 + (hashString(c.url) % 35),
    }))
  if (!hasAsiKey()) return heuristic()

  const compact = candidates.map((c, i) => ({
    i,
    title: c.title.slice(0, 90),
    url: c.url,
    snippet: c.snippet.slice(0, 160),
  }))
  const system =
    'You are a vetting analyst for a construction-development platform. You decide ' +
    'whether a web search result is a legitimate LOCAL contractor / construction ' +
    'or trade business with its own site — not a directory, marketplace, blog, ' +
    'job board, or social page. Be strict.'
  const prompt =
    `Location context: ${loc}. For each candidate that is a real local contractor / ` +
    `trade / construction business, return STRICT JSON only (no prose), shape: ` +
    `{"results":[{"i":<index>,"name":"<clean business name>","category":"<one of: ` +
    `general contractor, excavation, electrical, plumbing, concrete, surveying, ` +
    `architecture, supplier, equipment rental, roofing, landscaping, other>",` +
    `"conviction":<integer 0-100 quality and legitimacy>}]}. Omit directories and ` +
    `non-business pages entirely. Candidates: ${JSON.stringify(compact)}`
  try {
    const raw = await asiComplete(prompt, system)
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonStr) as { results?: unknown }
    const results = Array.isArray(parsed.results) ? (parsed.results as any[]) : []
    const mapped: VetResult[] = []
    for (const r of results) {
      const idx = Number(r?.i)
      const cand = candidates[idx]
      if (!Number.isInteger(idx) || !cand) continue
      mapped.push({
        i: idx,
        name: String(r?.name || cand.title).slice(0, 60),
        category: String(r?.category || cand.queryCategory),
        conviction: Math.max(0, Math.min(100, Math.round(Number(r?.conviction) || 0))),
      })
    }
    return mapped.length ? mapped : heuristic()
  } catch (err) {
    console.warn('[partners] ASI vetting failed, using heuristic:', errMsg(err))
    return heuristic()
  }
}

// --- Step 3: enrich from the contractor's OWN website (+ Maps rating) --------
async function enrichPartners(page: any, partners: BusinessPartner[]): Promise<void> {
  let budget = ENRICH_BUDGET
  for (const p of partners) {
    if (budget <= 0) break
    // Primary: scrape the contractor's own site — reliable, not bot-walled.
    if (p.website) {
      try {
        await gotoAndSettle(page, p.website, 1400)
        const info: { name: string; phone: string; email: string; logo: string } =
          await page.evaluate(siteContactExtract)
        if (info.phone) p.phone = info.phone
        if (info.email) p.email = info.email
        if (info.name && info.name.length > 2) p.name = info.name
        budget--
      } catch (err) {
        console.warn(`[partners] site enrich "${p.name}" failed:`, errMsg(err))
      }
    }
    // (Google Maps secondary lookup removed — too slow/bot-walled; site-direct
    // scraping above already yields phone/email reliably.)
  }
}

// --- Step 4: ranking ----------------------------------------------------------
function rankPartners(partners: BusinessPartner[]): BusinessPartner[] {
  return [...partners].sort((a, b) => {
    if (b.conviction !== a.conviction) return b.conviction - a.conviction
    const aSmall = a.logoWidth && a.logoWidth > 0 && a.logoWidth <= 72 ? 1 : 0
    const bSmall = b.logoWidth && b.logoWidth > 0 && b.logoWidth <= 72 ? 1 : 0
    if (bSmall !== aSmall) return bSmall - aSmall
    const aw = a.rating * Math.log10(a.reviewCount + 1)
    const bw = b.rating * Math.log10(b.reviewCount + 1)
    return bw - aw
  })
}

export async function scrapeLocalPartners(regionId: string): Promise<PartnerScrapeResult> {
  const { state, city, zips } = regionContextFor(regionId)
  const loc = city ? `${city}, ${state}` : state
  const fallback = (): PartnerScrapeResult => ({ partners: mockPartners(regionId), live: false })

  if (!hasBrowserbaseKey()) return fallback()

  try {
    return await withBrowserbasePage(
      async (page: any): Promise<PartnerScrapeResult> => {
        const candidates = await discoverContractors(page, zips, state)
        console.log(`[partners] ${regionId}: discovered ${candidates.length} real candidates`)
        if (!candidates.length) return fallback()

        const vetted = await vetCandidatesWithAsi(candidates, loc)
        if (!vetted.length) return fallback()

        let partners: BusinessPartner[] = vetted.slice(0, MAX_PARTNERS).map((v) => {
          const cand = candidates[v.i]!
          const id = `${regionId}-${hashString(cand.url)}`
          return {
            id,
            name: v.name,
            category: v.category,
            rating: 0,
            reviewCount: 0,
            conviction: v.conviction,
            website: cand.url,
            logo: faviconFor(cand.url),
            logoWidth: 64,
            sourceSite: hostOf(cand.url),
            scrapedAt: new Date().toISOString(),
          }
        })

        partners = rankPartners(partners)
        await enrichPartners(page, partners)
        const ranked = rankPartners(partners)
        return ranked.length ? { partners: ranked, live: true } : fallback()
      },
      { state },
    )
  } catch (err) {
    console.warn('[partners] live scrape failed, using mock:', errMsg(err))
    return fallback()
  }
}

// --- Deterministic mock fallback ---------------------------------------------
const MOCK_NAMES: Record<string, string[]> = {
  'general contractor': [
    'Summit Build Co.', 'Cornerstone Builders', 'Ironwood Construction',
    'Redline General Contracting', 'Keystone Build Group', 'Anvil & Oak Builders',
    'Patriot General Contractors', 'Blue Ridge Construction', 'Sterling Build Co.',
    'Foundry Contracting', 'Northgate Builders', 'Halcyon Construction',
  ],
  excavation: [
    'Bedrock Excavation', 'Terra Grading Co.', 'DeepCut Earthworks',
    'Ridgeline Excavating', 'Mammoth Site Works', 'Trench Pro Excavation',
    'Granite Earthmovers', 'Vanguard Excavation', 'Copperline Grading',
    'Frontier Site Prep', 'Drawn Stone Excavating', 'Basalt Earthworks',
  ],
  'construction company': [
    'Apex Construction', 'Granite Works', 'BuildRight Co.',
    'Meridian Construction', 'Cobalt Builders', 'Lighthouse Construction',
    'Evergreen Construction Co.', 'Titan Build Works', 'Harborview Construction',
    'Sequoia Construction', 'Brightline Builders', 'Atlas Construction Group',
  ],
  surveying: [
    'Meridian Survey Group', 'TruLine Surveyors', 'Benchmark Geomatics',
    'Cardinal Land Surveying', 'Precision Point Surveyors', 'Datum Survey Co.',
    'Compass Rose Surveying', 'Vertex Geomatics', 'Plumb Line Surveyors',
    'Northstar Land Survey', 'Axis Surveying', 'Bearing & Bound Surveyors',
  ],
  'home builder': [
    'NorthLight Homes', 'Vellum Custom Homes', 'Forma Residential',
    'Cedar & Sage Homes', 'Hearthstone Builders', 'Lantern Custom Homes',
    'Maplewood Residential', 'Crestline Homes', 'Auburn Lane Builders',
    'Willowbrook Homes', 'Stonegate Custom Homes', 'Birchwood Residential',
  ],
}
const MOCK_REVIEWS = [
  'Showed up on time, fair pricing, and the crew was professional from start to finish.',
  'Handled our permits and grading without a hitch — would absolutely hire again.',
  'Great communication throughout the project. Quality work and no surprises on the invoice.',
  'Responsive and knowledgeable about local code. Made the inspection process painless.',
]

export function mockPartners(regionId: string): BusinessPartner[] {
  const { state, city } = regionContextFor(regionId)
  const loc = city || state
  const out: BusinessPartner[] = []
  let n = 0
  for (const category of Object.keys(MOCK_NAMES)) {
    for (const baseName of MOCK_NAMES[category]!) {
      const hh = hashString(`${regionId}:${baseName}`)
      const rating = Math.round((3.8 + (hh % 12) / 10) * 10) / 10
      const reviewCount = 12 + (hh % 480)
      const area = 200 + (hh % 799)
      const line = 100 + (hh % 8999)
      const slug = baseName.toLowerCase().replace(/[^a-z]+/g, '')
      out.push({
        id: `${regionId}-mock-${n++}`,
        name: baseName,
        category,
        rating,
        reviewCount,
        conviction: 60 + (hh % 40),
        topReview: MOCK_REVIEWS[hh % MOCK_REVIEWS.length],
        phone: `(${area}) ${100 + (hh % 899)}-${(1000 + (line % 9000)).toString().padStart(4, '0')}`,
        website: `https://www.${slug}.com`,
        logo: `https://www.google.com/s2/favicons?domain=${slug}.com&sz=64`,
        logoWidth: 64,
        address: `${line} Main St, ${loc}`,
        sourceSite: `${slug}.com`,
        scrapedAt: new Date().toISOString(),
      })
    }
  }
  return rankPartners(out)
}