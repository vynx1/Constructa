// ---------------------------------------------------------------------------
// Local Partners — real contractor discovery (ASI + BrowserBase).
//
// Pipeline (master-plan stage-safe; degrades to mock at every step):
//   1. DISCOVER  — BrowserBase scrapes DuckDuckGo HTML search for contractor
//                  websites across the district's MAJOR ZIP codes (multiple
//                  trades). Yields real business name + website + snippet.
//   2. VET       — ASI:One quickly vets each name+link, filters out directories
//                  / non-businesses, normalizes the name + category, and scores
//                  a 0-100 "conviction" (quality/legitimacy). Highest first.
//   3. ENRICH    — BrowserBase pulls Google reviews (rating + review count) and
//                  contact info (phone, address) for the top vetted businesses.
//   4. RANK      — conviction desc, then small-logo preference (favicons), then
//                  review weight. Cached in Redis by the API; mock fallback.
// ---------------------------------------------------------------------------

import { withBrowserbasePage, gotoAndSettle, hasBrowserbaseKey } from '~/lib/browserbaseCore'
import { regionContextFor } from '~/lib/imageScraper'
import { asiComplete, hasAsiKey } from '~/lib/asi'

export interface BusinessPartner {
  id: string
  name: string
  category: string
  rating: number // 0-5
  reviewCount: number
  conviction: number // 0-100, ASI quality/legitimacy score
  topReview?: string
  phone?: string
  website?: string
  address?: string
  logo?: string // small favicon logo
  logoWidth?: number
  mapsUrl?: string
  sourceSite: string
  scrapedAt: string
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

// Trades to search for across each ZIP. Kept tight to bound search cost.
const DISCOVERY_QUERIES = [
  'general contractor',
  'excavation contractor',
  'construction company',
  'land surveyor',
  'home builder',
]
const MAX_ZIPS = 3 // major ZIP codes per district to search
const MAX_SEARCHES = 12 // hard cap on DDG queries per session
const RESULTS_PER_SEARCH = 6
const MAX_CANDIDATES = 50
const ENRICH_BUDGET = 16 // Google Maps lookups per session
const MAX_PARTNERS = 40

// Directory / aggregator hosts that are not the contractor's own business site.
const DIRECTORY_HOSTS = [
  'yelp.', 'angi.', 'angieslist.', 'thumbtack.', 'houzz.', 'bbb.org',
  'facebook.', 'yellowpages.', 'mapquest.', 'indeed.', 'linkedin.',
  'buildzoom.', 'porch.', 'homeadvisor.', 'manta.', 'nextdoor.',
  'wikipedia.', 'youtube.', 'reddit.', 'pinterest.', 'instagram.',
  'tripadvisor.', 'glassdoor.', 'zillow.', 'realtor.', 'redfin.',
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
  return DIRECTORY_HOSTS.some((d) => host.includes(d))
}

// Small, reliable logo for the "logo spot": the site's 64px favicon.
function faviconFor(url: string): string {
  const host = hostOf(url)
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : ''
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// --- In-page extractor: DuckDuckGo HTML results (very headless-friendly) ------
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
    const snip = (snipEl && snipEl.textContent ? snipEl.textContent : '').trim()
    if (!title || !href.startsWith('http')) continue
    if (seen.has(href)) continue
    seen.add(href)
    out.push({ title, url: href, snippet: snip.slice(0, 260) })
  }
  return out
}

// --- In-page extractor: Google Maps results feed (rating + reviews + address) -
function mapsFeedExtract(): Array<{
  name: string
  rating: number
  reviewCount: number
  address: string
  mapsUrl: string
}> {
  const feed = document.querySelector('div[role="feed"]') || document.body
  const cards = Array.from(feed.querySelectorAll('div.Nv2PK, a[href*="/maps/place/"]'))
  const out: Array<{
    name: string
    rating: number
    reviewCount: number
    address: string
    mapsUrl: string
  }> = []
  for (const card of cards) {
    const link = (
      card.matches('a[href*="/maps/place/"]')
        ? card
        : card.querySelector('a[href*="/maps/place/"]')
    ) as HTMLAnchorElement | null
    const nameEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall')
    const name =
      (nameEl && nameEl.textContent ? nameEl.textContent.trim() : '') ||
      (link && link.getAttribute('aria-label')
        ? (link.getAttribute('aria-label') as string).trim()
        : '')
    if (!name) continue
    const ratingEl = card.querySelector('span.MW4etd')
    const rcEl = card.querySelector('span.UY7F9')
    let rating = 0
    let reviewCount = 0
    if (ratingEl && ratingEl.textContent) {
      const rm = ratingEl.textContent.match(/(\d+(?:\.\d+)?)/)
      if (rm && rm[1]) rating = parseFloat(rm[1])
    }
    if (rcEl && rcEl.textContent) {
      const cm = rcEl.textContent.replace(/[(),]/g, ' ').match(/(\d[\d,]*)/)
      if (cm && cm[1]) reviewCount = parseInt(cm[1].replace(/,/g, ''), 10) || 0
    }
    const metaEls = Array.from(card.querySelectorAll('.W4Efsd'))
    const metaTxt = metaEls.map((mm) => mm.textContent || '').join(' · ')
    const addrMatch = metaTxt.match(/[\d][^·]*(?:St|Ave|Blvd|Rd|Dr|Hwy|Ln|Way|Pkwy|Ct)[^·]*/i)
    const address = addrMatch ? addrMatch[0].trim() : ''
    out.push({ name, rating, reviewCount, address, mapsUrl: link ? link.href : '' })
  }
  return out
}

function mapsPlaceExtract(): { phone: string; topReview: string } {
  const phoneBtn = document.querySelector('button[data-item-id^="phone"], a[href^="tel:"]')
  const phone =
    (phoneBtn && phoneBtn.getAttribute('aria-label')
      ? (phoneBtn.getAttribute('aria-label') as string).replace(/^Phone:\s*/i, '').trim()
      : '') ||
    (phoneBtn && phoneBtn.getAttribute('href')
      ? (phoneBtn.getAttribute('href') as string).replace(/^tel:/, '').trim()
      : '')
  const reviewEl = document.querySelector('.wiI7pd, .MyEned')
  const topReview =
    reviewEl && reviewEl.textContent ? reviewEl.textContent.trim().slice(0, 240) : ''
  return { phone, topReview }
}

// --- Step 1: discover contractor sites via DDG across major ZIPs -------------
async function discoverContractors(
  page: any,
  zips: string[],
  state: string,
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = []
  const seenHost = new Set<string>()
  let searches = 0
  const zipSlice = zips.slice(0, MAX_ZIPS)
  outer: for (const zip of zipSlice) {
    for (const query of DISCOVERY_QUERIES) {
      if (searches >= MAX_SEARCHES || candidates.length >= MAX_CANDIDATES) break outer
      searches++
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
          `${query} ${zip} ${state}`,
        )}`
        await gotoAndSettle(page, url, 1200)
        const results: Array<{ title: string; url: string; snippet: string }> =
          await page.evaluate(ddgResultsExtract)
        for (const r of results.slice(0, RESULTS_PER_SEARCH)) {
          if (isDirectory(r.url)) continue
          const host = hostOf(r.url)
          if (!host || seenHost.has(host)) continue
          seenHost.add(host)
          candidates.push({ ...r, zip, queryCategory: query })
          if (candidates.length >= MAX_CANDIDATES) break
        }
      } catch (err) {
        console.warn(`[partners] discover "${query} ${zip}" failed:`, errMsg(err))
      }
    }
  }
  return candidates
}

// --- Step 2: ASI vets names + links, scores conviction, normalizes category --
async function vetCandidatesWithAsi(
  candidates: RawCandidate[],
  loc: string,
): Promise<VetResult[]> {
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

// --- Step 3: enrich top vetted businesses with Google reviews + contact ------
async function enrichFromGoogleMaps(
  page: any,
  partners: BusinessPartner[],
  zipByName: Map<string, string>,
): Promise<BusinessPartner[]> {
  let budget = ENRICH_BUDGET
  for (const p of partners) {
    if (budget <= 0) break
    try {
      const zip = zipByName.get(p.id) || ''
      const url = `https://www.google.com/maps/search/${encodeURIComponent(
        `${p.name} ${zip}`,
      )}/`
      await gotoAndSettle(page, url, 2600)
      const feed: Array<{
        name: string
        rating: number
        reviewCount: number
        address: string
        mapsUrl: string
      }> = await page.evaluate(mapsFeedExtract)
      const first = Array.isArray(feed) && feed.length ? feed[0] : null
      if (first) {
        if (first.rating) p.rating = first.rating
        if (first.reviewCount) p.reviewCount = first.reviewCount
        if (first.address) p.address = first.address
        if (first.mapsUrl) p.mapsUrl = first.mapsUrl
      }
      budget--
      if (p.mapsUrl && budget > 0) {
        try {
          await gotoAndSettle(page, p.mapsUrl, 1800)
          const detail: { phone: string; topReview: string } =
            await page.evaluate(mapsPlaceExtract)
          if (detail.phone) p.phone = detail.phone
          if (detail.topReview) p.topReview = detail.topReview
          budget--
        } catch {
          /* ignore detail failure */
        }
      }
    } catch (err) {
      console.warn(`[partners] enrich "${p.name}" failed:`, errMsg(err))
    }
  }
  return partners
}

// --- Step 4: final ranking ----------------------------------------------------
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

export async function scrapeLocalPartners(regionId: string): Promise<BusinessPartner[]> {
  const { state, city, zips } = regionContextFor(regionId)
  const loc = city ? `${city}, ${state}` : state

  if (!hasBrowserbaseKey()) return mockPartners(regionId)

  try {
    return await withBrowserbasePage(
      async (page: any) => {
        const candidates = await discoverContractors(page, zips, state)
        if (!candidates.length) return mockPartners(regionId)

        const vetted = await vetCandidatesWithAsi(candidates, loc)
        if (!vetted.length) return mockPartners(regionId)

        const zipByName = new Map<string, string>()
        let partners: BusinessPartner[] = vetted.slice(0, MAX_PARTNERS).map((v) => {
          const cand = candidates[v.i]!
          const id = `${regionId}-${hashString(cand.url)}`
          zipByName.set(id, cand.zip)
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
        await enrichFromGoogleMaps(page, partners, zipByName)
        const ranked = rankPartners(partners)
        return ranked.length ? ranked : mockPartners(regionId)
      },
      { state },
    )
  } catch (err) {
    console.warn('[partners] live scrape failed, using mock:', errMsg(err))
    return mockPartners(regionId)
  }
}

// --- Deterministic mock fallback (stable per region) -------------------------
const MOCK_NAMES: Record<string, string[]> = {
  'general contractor': ['Summit Build Co.', 'Cornerstone Builders', 'Ironwood Construction'],
  excavation: ['Bedrock Excavation', 'Terra Grading Co.', 'DeepCut Earthworks'],
  'construction company': ['Apex Construction', 'Granite Works', 'BuildRight Co.'],
  surveying: ['Meridian Survey Group', 'TruLine Surveyors', 'Benchmark Geomatics'],
  'home builder': ['NorthLight Homes', 'Vellum Custom Homes', 'Forma Residential'],
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