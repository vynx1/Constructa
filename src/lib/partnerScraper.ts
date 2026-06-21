// ---------------------------------------------------------------------------
// Local Partners — BrowserBase business + reviews scraper.
//
// Given a congressional region, finds local contractors / suppliers / trades
// near the property's city+state and extracts name, category, rating, review
// count, a top review snippet, phone, website and address. ONE BrowserBase
// session scrapes ALL categories (cost-optimized); per-category failures are
// isolated; everything degrades to deterministic mock data so the UI always
// renders (master-plan stage-safe contract, same as imageScraper).
// ---------------------------------------------------------------------------

import { withBrowserbasePage, gotoAndSettle, hasBrowserbaseKey } from '~/lib/browserbaseCore'
import { regionContextFor } from '~/lib/imageScraper'

export interface BusinessPartner {
  id: string
  name: string
  category: string
  rating: number // 0-5
  reviewCount: number
  topReview?: string
  phone?: string
  website?: string
  address?: string
  logo?: string
  mapsUrl?: string
  sourceSite: string
  scrapedAt: string
}

// Trades that actually support a ground-up land development project.
const PARTNER_CATEGORIES = [
  'general contractor',
  'construction supplier',
  'equipment rental',
  'land surveyor',
  'architect',
  'excavation contractor',
  'electrician',
  'plumbing contractor',
  'concrete contractor',
]

const DETAIL_BUDGET = 14 // cap detail-page visits per session to bound cost

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// In-page extractor for a Google Maps results feed. Returns raw cards.
function mapsFeedExtract(category: string): any[] {
  const feed = document.querySelector('div[role="feed"]') ?? document.body
  const cards = Array.from(feed.querySelectorAll('div.Nv2PK, a[href*="/maps/place/"]'))
  const seen = new Set<string>()
  const out: any[] = []
  for (const card of cards) {
    const link =
      (card.matches('a[href*="/maps/place/"]')
        ? (card as HTMLAnchorElement)
        : (card.querySelector('a[href*="/maps/place/"]') as HTMLAnchorElement | null))
    const href = link?.href ?? ''
    const nameEl =
      card.querySelector('.qBF1Pd, .fontHeadlineSmall') ??
      (link?.getAttribute('aria-label') ? link : null)
    const name =
      (nameEl as HTMLElement)?.textContent?.trim() ||
      link?.getAttribute('aria-label')?.trim() ||
      ''
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)

    // rating + review count, e.g. aria-label "4.6 stars 128 Reviews"
    const ratingEl = card.querySelector('span.MW4etd, span[role="img"][aria-label*="star"]')
    let rating = 0
    let reviewCount = 0
    const ratingTxt =
      (ratingEl as HTMLElement)?.textContent?.trim() ||
      ratingEl?.getAttribute('aria-label') ||
      ''
    const rMatch = ratingTxt.match(/(\d+(?:\.\d+)?)/)
    if (rMatch) rating = parseFloat(rMatch[1]!)
    const rcEl = card.querySelector('span.UY7F9')
    const rcTxt = (rcEl as HTMLElement)?.textContent ?? ratingTxt
    const rcMatch = rcTxt.replace(/[(),]/g, ' ').match(/(\d[\d,]*)\s*(?:reviews?)?/i)
    if (rcMatch) reviewCount = parseInt(rcMatch[1]!.replace(/,/g, ''), 10) || 0

    // address + meta line(s)
    const metaEls = Array.from(card.querySelectorAll('.W4Efsd'))
    const metaTxt = metaEls.map((m) => (m as HTMLElement).textContent ?? '').join(' · ')
    const addrMatch = metaTxt.match(/[\d][^·]*(?:St|Ave|Blvd|Rd|Dr|Hwy|Ln|Way|Pkwy|Ct)[^·]*/i)
    const address = addrMatch ? addrMatch[0].trim() : metaTxt.split('·').pop()?.trim() ?? ''

    // logo / first photo
    const img = card.querySelector('img') as HTMLImageElement | null
    const logo = img ? img.currentSrc || img.src || '' : ''

    out.push({ name, category, rating, reviewCount, address, mapsUrl: href, logo })
  }
  return out
}

// In-page extractor for a single Maps place panel: phone, website, top review.
function mapsPlaceExtract(): any {
  const phoneBtn = document.querySelector('button[data-item-id^="phone"], a[href^="tel:"]')
  const phone =
    phoneBtn?.getAttribute('aria-label')?.replace(/^Phone:\s*/i, '').trim() ||
    phoneBtn?.getAttribute('href')?.replace(/^tel:/, '').trim() ||
    ''
  const siteEl = document.querySelector(
    'a[data-item-id="authority"], a[aria-label^="Website"]',
  ) as HTMLAnchorElement | null
  const website = siteEl?.href ?? ''
  const reviewEl = document.querySelector('.wiI7pd, .MyEned')
  const topReview = (reviewEl as HTMLElement)?.textContent?.trim()?.slice(0, 240) ?? ''
  return { phone, website, topReview }
}

export async function scrapeLocalPartners(regionId: string): Promise<BusinessPartner[]> {
  const { state, city } = regionContextFor(regionId)
  const loc = city ? `${city}, ${state}` : state

  if (!hasBrowserbaseKey()) return mockPartners(regionId)

  try {
    return await withBrowserbasePage(
      async (page) => {
        const collected: BusinessPartner[] = []
        const seen = new Set<string>()
        let detailBudget = DETAIL_BUDGET

        for (const category of PARTNER_CATEGORIES) {
          try {
            const url = `https://www.google.com/maps/search/${encodeURIComponent(
              `${category} near ${loc}`,
            )}/`
            await gotoAndSettle(page, url, 3500)
            // scroll the results feed to trigger lazy loading
            for (let i = 0; i < 3; i++) {
              await page
                .evaluate(() => {
                  const feed = document.querySelector('div[role="feed"]')
                  if (feed) feed.scrollBy(0, feed.scrollHeight)
                })
                .catch(() => {})
              await page.waitForTimeout(900)
            }
            const raw: any[] = await page.evaluate(mapsFeedExtract, category)
            for (const r of raw.slice(0, 6)) {
              const key = `${r.name}|${r.address}`.toLowerCase()
              if (seen.has(key) || !r.name) continue
              seen.add(key)
              collected.push({
                id: `${regionId}-${hashString(key)}`,
                name: r.name,
                category,
                rating: r.rating || 0,
                reviewCount: r.reviewCount || 0,
                address: r.address || '',
                logo: r.logo || '',
                mapsUrl: r.mapsUrl || '',
                sourceSite: 'google-maps',
                scrapedAt: new Date().toISOString(),
              })
            }
          } catch (err) {
            console.warn(`[partners] category "${category}" failed:`, (err as Error).message)
          }
          if (collected.length >= 40) break
        }

        // Detail pass: enrich the top businesses with phone/website/review.
        for (const p of collected) {
          if (detailBudget <= 0) break
          if (!p.mapsUrl) continue
          try {
            await gotoAndSettle(page, p.mapsUrl, 2500)
            const detail: any = await page.evaluate(mapsPlaceExtract)
            if (detail.phone) p.phone = detail.phone
            if (detail.website) p.website = detail.website
            if (detail.topReview) p.topReview = detail.topReview
            detailBudget--
          } catch {
            /* ignore per-detail failures */
          }
        }

        const result = collected.filter((p) => p.name)
        return result.length ? result : mockPartners(regionId)
      },
      { state },
    )
  } catch (err) {
    console.warn('[partners] live scrape failed, using mock:', (err as Error).message)
    return mockPartners(regionId)
  }
}

// --- Deterministic mock fallback (stable per region) ---------------------------
const MOCK_NAMES: Record<string, string[]> = {
  'general contractor': ['Summit Build Co.', 'Cornerstone Builders', 'Ironwood Construction'],
  'construction supplier': ['ProBuild Supply', 'Apex Materials', 'Granite State Supply'],
  'equipment rental': ['HeavyHaul Rentals', 'SiteGear Equipment', 'United Rents'],
  'land surveyor': ['Meridian Survey Group', 'TruLine Surveyors', 'Benchmark Geomatics'],
  architect: ['Forma Architecture', 'NorthLight Studio', 'Vellum Design Works'],
  'excavation contractor': ['Bedrock Excavation', 'Terra Grading Co.', 'DeepCut Earthworks'],
  electrician: ['Voltus Electric', 'BrightWire Electrical', 'Current Co.'],
  'plumbing contractor': ['FlowRight Plumbing', 'BluePipe Mechanical', 'Cascade Plumbing'],
  'concrete contractor': ['SolidForm Concrete', 'Caststone Co.', 'GreyLine Concrete'],
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
  for (const category of PARTNER_CATEGORIES) {
    const names = MOCK_NAMES[category] ?? ['Local Trade Co.']
    for (const baseName of names) {
      const h = hashString(`${regionId}:${baseName}`)
      const rating = 3.8 + (h % 12) / 10 // 3.8 - 4.9
      const reviewCount = 12 + (h % 480)
      const area = 200 + (h % 799)
      const line = 100 + (h % 8999)
      out.push({
        id: `${regionId}-mock-${n++}`,
        name: baseName,
        category,
        rating: Math.round(rating * 10) / 10,
        reviewCount,
        topReview: MOCK_REVIEWS[h % MOCK_REVIEWS.length],
        phone: `(${area}) ${100 + (h % 899)}-${(1000 + (line % 9000)).toString().padStart(4, '0')}`,
        website: `https://www.${baseName.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
        address: `${line} Main St, ${loc}`,
        logo: '',
        mapsUrl: '',
        sourceSite: 'mock',
        scrapedAt: new Date().toISOString(),
      })
    }
  }
  return out
}