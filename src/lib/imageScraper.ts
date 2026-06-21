// Live listing + image extraction via Browserbase (LandSearch, Realtor, Zillow, DDG).

import { gotoAndSettle } from '~/lib/browserbaseCore'
import { verifyListingImages } from '~/lib/imageVerification'
import type { ImageSourceSite } from '~/lib/imageProvenance'
import type { CongressRegion } from '~/lib/mapGeo'
import { resolveRegion, stateCodeFromRegionId } from '~/lib/regionContext'

export interface RawListingCard {
  source: string
  sourceSite: ImageSourceSite
  href: string
  text: string
  alt: string
  images: string[]
  center: [number, number] | null
  sourcePageUrl: string
}

// --- In-page extractors (serialized into the browser via page.evaluate) --------

export function landSearchPageExtract(): RawListingCard[] {
  const cards = Array.from(
    document.querySelectorAll('article.preview, article[data-uid^="card-"]'),
  )
  const out: RawListingCard[] = []
  const pageUrl = location.href
  for (const card of cards) {
    const a = card.querySelector('a[href*="/properties/"]') as HTMLAnchorElement | null
    if (!a) continue
    const img = card.querySelector('img') as HTMLImageElement | null
    const alt = img?.getAttribute('alt') ?? ''
    const images: string[] = []
    for (const i of Array.from(card.querySelectorAll('img'))) {
      const el = i as HTMLImageElement
      const url =
        el.currentSrc ||
        el.src ||
        el.getAttribute('data-src') ||
        el.getAttribute('data-lazy-src') ||
        ''
      if (url.includes('cdn.landsearch.com')) images.push(url.split('?')[0]!)
    }
    let center: [number, number] | null = null
    try {
      const c = JSON.parse(card.getAttribute('data-context') || '{}').center
      if (Array.isArray(c) && c.length >= 2) center = [c[0], c[1]]
    } catch {
      /* no geo */
    }
    out.push({
      source: 'LandSearch',
      sourceSite: 'landsearch',
      href: 'https://www.landsearch.com' + (a.getAttribute('href') ?? ''),
      text: (card as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      alt,
      images: [...new Set(images)],
      center,
      sourcePageUrl: pageUrl,
    })
    if (out.length >= 8) break
  }
  return out
}

export function realtorPageExtract(): RawListingCard[] {
  const imgs = Array.from(document.querySelectorAll('img')).filter((i) => {
    const src = (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src || ''
    return src.includes('rdcpix')
  })
  const out: RawListingCard[] = []
  const seen = new Set<Element>()
  const pageUrl = location.href
  for (const img of imgs) {
    const card = (img.closest('li, article, div[data-testid]') ||
      img.parentElement) as Element | null
    if (!card || seen.has(card)) continue
    seen.add(card)
    const text = (card as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
    if (!/\$[\d,]{4,}/.test(text)) continue
    const el = img as HTMLImageElement
    const url = (el.currentSrc || el.src || '').split('?')[0]!
    const a = card.querySelector(
      'a[href*="realestateandhomes-detail"]',
    ) as HTMLAnchorElement | null
    out.push({
      source: 'Realtor.com',
      sourceSite: 'realtor',
      href: a?.href ?? '',
      text,
      alt: '',
      images: url ? [url] : [],
      center: null,
      sourcePageUrl: pageUrl,
    })
    if (out.length >= 6) break
  }
  return out
}

export function zillowSearchPageExtract(): RawListingCard[] {
  const pageUrl = location.href
  const cards = Array.from(
    document.querySelectorAll(
      'article[data-test="property-card"], li[data-testid="property-card"]',
    ),
  )
  const out: RawListingCard[] = []
  for (const card of cards) {
    const text = (card as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
    if (!/\$[\d,]{4,}/.test(text)) continue
    const a = card.querySelector(
      'a[href*="/homedetails/"], a[href*="/b/"]',
    ) as HTMLAnchorElement | null
    const images: string[] = []
    for (const i of Array.from(card.querySelectorAll('img'))) {
      const el = i as HTMLImageElement
      const url = el.currentSrc || el.src || el.getAttribute('data-src') || ''
      if (url.includes('photos.zillowstatic.com')) images.push(url.split('?')[0]!)
    }
    out.push({
      source: 'Zillow',
      sourceSite: 'zillow',
      href: a?.href ?? '',
      text,
      alt: card.querySelector('img')?.getAttribute('alt') ?? '',
      images: [...new Set(images)],
      center: null,
      sourcePageUrl: pageUrl,
    })
    if (out.length >= 6) break
  }
  return out
}

/** Scroll gallery + read zillowstatic from DOM (used after CDP capture). */
export function zillowGalleryDomExtract(): string[] {
  const urls: string[] = []
  for (const i of Array.from(document.querySelectorAll('img'))) {
    const el = i as HTMLImageElement
    const url = el.currentSrc || el.src || el.getAttribute('data-src') || ''
    if (url.includes('photos.zillowstatic.com')) urls.push(url.split('?')[0]!)
  }
  return [...new Set(urls)]
}

// --- Zillow gallery hydration via CDP network capture ------------------------

export async function captureZillowGalleryPhotos(
  page: any,
  listingUrl: string,
): Promise<string[]> {
  const captured: string[] = []
  try {
    const client = await page.context().newCDPSession(page)
    await client.send('Network.enable')
    client.on('Network.responseReceived', (e: any) => {
      const u: string = e.response?.url ?? ''
      if (u.includes('photos.zillowstatic.com') && /\.(jpg|webp|jpeg)/i.test(u)) {
        captured.push(u.split('?')[0]!)
      }
    })
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    for (let y = 0; y < 6; y++) {
      await page.mouse.wheel(0, 2000)
      await page.waitForTimeout(600)
    }
    try {
      await page.waitForSelector('img[src*="zillowstatic.com"]', { timeout: 12_000 })
    } catch {
      /* gallery may still be in network log */
    }
    const dom: string[] = await page.evaluate(zillowGalleryDomExtract)
    return [...new Set([...captured, ...dom])]
  } catch {
    return []
  }
}

// --- DuckDuckGo ZIP image fallback (never picsum) ------------------------------

export async function duckDuckGoZipImageFallback(
  page: any,
  zip: string,
  city?: string,
): Promise<string[]> {
  const q = `${city ?? ''} ${zip} vacant land parcel`.trim()
  const url =
    'https://duckduckgo.com/?q=' +
    encodeURIComponent(q) +
    '&iax=images&ia=images'
  try {
    await gotoAndSettle(page, url, 2500)
    const imgs: string[] = await page.evaluate(() => {
      const urls: string[] = []
      for (const a of Array.from(
        document.querySelectorAll('a[data-testid="tile"], a.tile--img'),
      )) {
        const img = a.querySelector('img') as HTMLImageElement | null
        if (!img) continue
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || ''
        if (src.startsWith('http') && !src.includes('duckduckgo.com')) urls.push(src)
      }
      for (const img of Array.from(document.querySelectorAll('img'))) {
        const el = img as HTMLImageElement
        const src = el.currentSrc || el.src || ''
        if (
          src.startsWith('http') &&
          !src.includes('duckduckgo.com') &&
          /\.(jpg|jpeg|webp|png)/i.test(src)
        ) {
          urls.push(src.split('?')[0]!)
        }
      }
      return [...new Set(urls)].slice(0, 6)
    })
    return imgs
  } catch {
    return []
  }
}

// --- Orchestrate multi-source live scrape --------------------------------------

export async function scrapeRawListingCards(
  page: any,
  region: CongressRegion | null,
  zips: string[],
): Promise<RawListingCard[]> {
  const collected: RawListingCard[] = []
  const primaryZip = zips[0] ?? '90001'
  const state = region?.code ?? 'CA'

  for (const zip of zips.slice(0, 2)) {
    if (collected.length >= 6) break
    try {
      await gotoAndSettle(page, `https://www.landsearch.com/properties/${zip}`, 4000)
      collected.push(...(await page.evaluate(landSearchPageExtract)))
    } catch {
      /* next source */
    }
  }

  if (collected.length < 6) {
    try {
      await gotoAndSettle(
        page,
        `https://www.realtor.com/realestateandhomes-search/${primaryZip}/type-land`,
        4000,
      )
      collected.push(...(await page.evaluate(realtorPageExtract)))
    } catch {
      /* best-effort */
    }
  }

  if (collected.length < 6) {
    try {
      await gotoAndSettle(
        page,
        `https://www.zillow.com/homes/for_sale/${primaryZip}_rb/land_type/`,
        5000,
      )
      const cards: RawListingCard[] = await page.evaluate(zillowSearchPageExtract)
      for (const card of cards) {
        if (card.images.length < 2 && card.href) {
          const hydrated = await captureZillowGalleryPhotos(page, card.href)
          card.images = [...new Set([...card.images, ...hydrated])]
        }
        collected.push(card)
        if (collected.length >= 8) break
      }
    } catch {
      /* best-effort */
    }
  }

  void state
  return collected
}

// Page-INDEPENDENT fast path: verify a card's inline images without touching the
// browser page. Safe to run in parallel across many cards (Task 2 efficiency:
// we pre-verify all cards concurrently, then only page-bound fallbacks stay
// serial). Returns needsFallback=true when inline images don't verify.
export async function verifyCardInlineImages(
  card: RawListingCard,
): Promise<{ images: string[]; imageUnavailable: boolean; needsFallback: boolean }> {
  const { verified } = await verifyListingImages(
    card.images,
    card.sourceSite,
    card.sourcePageUrl,
  )
  if (verified.length) return { images: verified, imageUnavailable: false, needsFallback: false }
  return { images: [], imageUnavailable: true, needsFallback: true }
}

export async function hydrateCardImages(
  page: any,
  card: RawListingCard,
  zip: string,
  city: string,
): Promise<{ images: string[]; imageUnavailable: boolean }> {
  let urls = card.images

  const { verified } = await verifyListingImages(
    urls,
    card.sourceSite,
    card.sourcePageUrl,
  )
  if (verified.length) return { images: verified, imageUnavailable: false }

  if (card.sourceSite === 'zillow' && card.href) {
    const hydrated = await captureZillowGalleryPhotos(page, card.href)
    const v2 = await verifyListingImages(hydrated, 'zillow', card.href)
    if (v2.verified.length) return { images: v2.verified, imageUnavailable: false }
    urls = hydrated
  }

  const ddg = await duckDuckGoZipImageFallback(page, zip, city)
  const v3 = await verifyListingImages(ddg, 'duckduckgo', `https://duckduckgo.com/?q=${zip}`)
  if (v3.verified.length) return { images: v3.verified, imageUnavailable: false }

  return { images: [], imageUnavailable: true }
}

export function regionContextFor(regionId: string) {
  const region = resolveRegion(regionId)
  const zips = region?.zips?.length ? region.zips : ['90001']
  const state = stateCodeFromRegionId(regionId) || region?.code || 'CA'
  return { region, zips, state, city: region?.city ?? '' }
}