// ---------------------------------------------------------------------------
// Browserbase headless web-extraction pipeline (master plan §3B).
//
// Image extraction is ISOLATED in imageScraper.ts + imageVerification.ts:
// live currentSrc from marketplace CDNs, provenance guards, vision/reachability
// gate, DuckDuckGo ZIP fallback — NEVER picsum stock photos.
// ---------------------------------------------------------------------------

import { getDistrict } from '~/lib/mapData'
import { withBrowserbasePage, hasBrowserbaseKey } from '~/lib/browserbaseCore'
import {
  scrapeRawListingCards,
  hydrateCardImages,
  regionContextFor,
  type RawListingCard,
} from '~/lib/imageScraper'
import { resolveRegion, stateCodeFromRegionId } from '~/lib/regionContext'

export interface ScrapeResult {
  district: string
  blocks: string[]
  live: boolean
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

function mockScrapeBlocks(districtId: string, projectType: string): string[] {
  const d = getDistrict(districtId)
  const name = d?.regionalName ?? districtId
  return [
    `<table class="permit-history-grid"><tr><td>${name} ${projectType} permit #2026-0${
      Math.floor(Math.random() * 900) + 100
    } APPROVED in 34 days</td></tr><tr><td>Average permit approval velocity this quarter: 41 days, down from 58.</td></tr></table>`,
    `<div class="zoning-matrix">{ "parcel": "buildable", "zone": "mixed-use MU-3", "restricted": "12% protected/tribal" }</div>`,
    `<div class="post-body-content">Local support for new ${projectType} zoning; contractor noted inspection delays ~2 weeks.</div>`,
  ]
}

async function liveScrapeBlocks(
  districtId: string,
  _projectType: string,
): Promise<string[]> {
  const { region, zips } = regionContextFor(districtId)
  const stateName = (region?.label ?? stateCodeFromRegionId(districtId)).split('·')[0]!.trim()
  const zip = zips[0] ?? ''

  const queries = [
    `${stateName} ${zip} building permit approval velocity zoning land use`,
    `${stateName} ${zip} new construction development community support opposition`,
  ]

  return withBrowserbasePage(async (page) => {
    const blocks: string[] = []
    for (const q of queries) {
      try {
        await page.goto(
          'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q),
          { waitUntil: 'domcontentloaded', timeout: 40_000 },
        )
        await page.waitForTimeout(1800)
        const text: string = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.result__snippet'))
            .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 6)
            .join(' '),
        )
        if (text) blocks.push(text)
      } catch {
        /* skip failed query */
      }
    }
    if (!blocks.length) throw new Error('no research snippets scraped')
    return blocks
  })
}

function buildListingSources(r: RawListingCard, zip: string): LandListing['sources'] {
  const out: LandListing['sources'] = []
  if (r.href) out.push({ title: `${r.source} listing — ${zip}`, url: r.href })
  out.push(
    { title: `Zillow land watch — ${zip}`, url: `https://www.zillow.com/homes/${zip}_rb/land_type/` },
    { title: `LandWatch — ${zip}`, url: `https://www.landwatch.com/${zip}` },
  )
  return out
}

function cardToListing(
  r: RawListingCard,
  regionId: string,
  i: number,
  region: ReturnType<typeof resolveRegion>,
  fallbackZip: string,
  imagePack: { images: string[]; imageUnavailable: boolean },
): LandListing | null {
  const priceMatch = r.text.match(/\$\d{1,3}(?:,\d{3})+/)
  if (!priceMatch) return null
  const priceNum = Number(priceMatch[0].replace(/[$,]/g, ''))
  const acresSource = /acres?/i.test(r.alt) ? r.alt : r.text
  const acresMatch = acresSource.match(/(\d+(?:\.\d+)?)\s*acres?/i)
  const acres = acresMatch ? parseFloat(acresMatch[1] ?? '0') : 0
  const loc: string = (r.text.match(/[A-Z][A-Za-z .]+,\s*[A-Z]{2}\s*\d{5}/) || [])[0] || ''
  const zipMatch = loc.match(/\b(\d{5})\b/)
  const cityState =
    (loc.match(/([A-Za-z .]+),\s*([A-Z]{2})/) || [])[0] || loc || region?.city || ''
  const landType =
    (r.alt.match(/(Residential|Commercial|Agricultural|Recreational|Industrial|Vacant)\s+Land/i) ||
      [])[0]
  const ppa = acres > 0 ? Math.round(priceNum / acres) : 0

  return {
    id: `${regionId}-plot-${i}`,
    title: (r.alt && r.alt.length > 8 ? r.alt : `Land in ${cityState || 'this area'}`).slice(0, 90),
    zip: zipMatch?.[1] ?? fallbackZip,
    price: priceMatch[0],
    pricePerAcre: ppa ? `$${(ppa / 1000).toFixed(0)}K/ac` : '—',
    acreage: acres ? `${acres} ac` : '—',
    zone: landType || 'Vacant land',
    lng: r.center?.[0] ?? region?.center[0] ?? -98,
    lat: r.center?.[1] ?? region?.center[1] ?? 39,
    images: imagePack.images,
    imageUnavailable: imagePack.imageUnavailable,
    sources: buildListingSources(r, zipMatch?.[1] ?? fallbackZip),
  }
}

async function liveScrapeLandListings(regionId: string): Promise<LandListing[]> {
  const { region, zips, state, city } = regionContextFor(regionId)
  const primaryZip = zips[0]!

  return withBrowserbasePage(
    async (page) => {
      const raw = await scrapeRawListingCards(page, region, zips)
      const listings: LandListing[] = []
      const seen = new Set<string>()

      for (let i = 0; i < raw.length && listings.length < 8; i++) {
        const card = raw[i]!
        const zipForFallback = card.text.match(/\b(\d{5})\b/)?.[1] ?? primaryZip
        const imagePack = await hydrateCardImages(page, card, zipForFallback, city)
        const listing = cardToListing(
          card,
          regionId,
          listings.length,
          region,
          primaryZip,
          imagePack,
        )
        if (!listing) continue
        const key = `${listing.price}|${listing.zip}|${listing.acreage}`
        if (seen.has(key)) continue
        seen.add(key)
        listings.push(listing)
      }

      if (!listings.length) throw new Error('no listings parsed from any source')
      return listings
    },
    { state, advancedStealth: true },
  )
}

const LAND_TITLES = [
  'Vacant residential parcel',
  'Mixed-use development lot',
  'Commercial pad site',
  'Infill teardown lot',
  'Greenfield acreage',
  'Corner retail parcel',
  'Industrial flex land',
  'Transit-adjacent lot',
]
const ZONES = ['MU-3 mixed-use', 'RM-2 residential', 'CC-3 commercial', 'PAD planned', 'CS-MU', 'C2 commercial']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Offline mock parcels — no stock photos; imageUnavailable until live scrape runs. */
function mockListingsForRegion(regionId: string): LandListing[] {
  const region = resolveRegion(regionId)
  const zips = region?.zips?.length ? region.zips : ['90001']
  const [cLng, cLat] = region?.center ?? [-98, 39]
  const count = 5 + (hash(regionId) % 3)
  const listings: LandListing[] = []

  for (let i = 0; i < count; i++) {
    const h = hash(`${regionId}:${i}`)
    const zip = zips[i % zips.length]!
    const acres = 0.2 + (h % 60) / 10
    const ppa = 180_000 + (h % 12) * 55_000
    const price = Math.round(acres * ppa)
    listings.push({
      id: `${regionId}-plot-${i}`,
      title: LAND_TITLES[h % LAND_TITLES.length]!,
      zip,
      price: `$${(price / 1000).toFixed(0)}K`,
      pricePerAcre: `$${(ppa / 1000).toFixed(0)}K/ac`,
      acreage: `${acres.toFixed(1)} ac`,
      zone: ZONES[h % ZONES.length]!,
      lng: cLng + (((h % 100) - 50) / 100) * 0.4,
      lat: cLat + ((((h >> 7) % 100) - 50) / 100) * 0.3,
      images: [],
      imageUnavailable: true,
      sources: [
        { title: `LandWatch listing — ${zip}`, url: `https://www.landwatch.com/${zip}` },
        { title: `Zillow land watch — ${zip}`, url: `https://www.zillow.com/homes/${zip}_rb/land_type/` },
      ],
    })
  }
  return listings
}

export async function scrapeLandListings(regionId: string): Promise<{
  regionId: string
  listings: LandListing[]
  live: boolean
}> {
  if (hasBrowserbaseKey()) {
    try {
      const listings = await liveScrapeLandListings(regionId)
      return { regionId, listings, live: true }
    } catch (err) {
      console.warn('[browserbase] live listings failed, using mock:', (err as Error).message)
    }
  }
  return { regionId, listings: mockListingsForRegion(regionId), live: false }
}

export async function executeBrowserbaseScrapePipeline(
  districtId: string,
  projectType = 'mixed_use',
): Promise<ScrapeResult> {
  if (hasBrowserbaseKey()) {
    try {
      const blocks = await liveScrapeBlocks(districtId, projectType)
      return { district: districtId, blocks, live: true }
    } catch (err) {
      console.warn('[browserbase] live scrape failed, using mock:', (err as Error).message)
    }
  }
  return {
    district: districtId,
    blocks: mockScrapeBlocks(districtId, projectType),
    live: false,
  }
}
