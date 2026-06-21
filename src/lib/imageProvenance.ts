// Provenance guards for listing photos — only true marketplace CDN URLs survive.

export type ImageSourceSite = 'landsearch' | 'realtor' | 'zillow' | 'duckduckgo'

export interface ImageProvenance {
  url: string
  sourceSite: ImageSourceSite
  sourcePageUrl: string
  scrapedAt: string
}

const CDN_GUARDS: Record<ImageSourceSite, (url: string) => boolean> = {
  landsearch: (u) => u.includes('cdn.landsearch.com'),
  realtor: (u) => u.includes('rdcpix'),
  zillow: (u) => u.includes('photos.zillowstatic.com'),
  duckduckgo: (u) =>
    u.startsWith('http') &&
    !u.includes('duckduckgo.com/i/') &&
    /\.(jpg|jpeg|webp|png)(\?|$)/i.test(u),
}

export function isListingCdnUrl(url: string, site: ImageSourceSite): boolean {
  if (!url.startsWith('http')) return false
  if (url.includes('picsum.photos')) return false
  return CDN_GUARDS[site](url)
}

/** Read live image URLs from rendered <img> nodes (currentSrc first). */
export function readImgUrls(
  imgs: HTMLImageElement[],
  guard: (url: string) => boolean,
): string[] {
  const out: string[] = []
  for (const img of imgs) {
    const url =
      img.currentSrc ||
      img.src ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      ''
    if (url && guard(url)) out.push(url.split('?')[0]!)
  }
  return [...new Set(out)]
}

export function provenanceFor(
  urls: string[],
  sourceSite: ImageSourceSite,
  sourcePageUrl: string,
): ImageProvenance[] {
  const scrapedAt = new Date().toISOString()
  return urls
    .filter((u) => isListingCdnUrl(u, sourceSite))
    .map((url) => ({ url, sourceSite, sourcePageUrl, scrapedAt }))
}
