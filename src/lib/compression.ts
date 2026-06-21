// ---------------------------------------------------------------------------
// Local in-memory semantic compression (Map System master plan §3C).
//
// The revised plan REMOVES The Token Company middleware. Instead, raw
// Browserbase scrapes are compressed here, in-process, before being piped
// directly into ASI:One. This keeps the (often large, noisy) scraped payloads
// cheap and fast to reason over without a third-party hop.
//
// Strategy: strip markup/whitespace, split into sentences, and keep only the
// sentences that carry land-acquisition signal (permit / zoning / cost / etc.).
// ---------------------------------------------------------------------------

const SIGNAL_KEYWORDS = [
  'permit',
  'zoning',
  'zone',
  'cost',
  'price',
  'reject',
  'approve',
  'approval',
  'delay',
  'hazard',
  'setback',
  'variance',
  'inspection',
  'ceqa',
  'exemption',
  'sentiment',
  'oppose',
  'support',
]

/** Remove HTML tags and collapse runs of whitespace. */
function stripMarkupAndWhitespace(block: string): string {
  return block
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Naive sentence splitter — good enough for scraped, semi-structured text. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function containsSignal(sentence: string): boolean {
  const lower = sentence.toLowerCase()
  return SIGNAL_KEYWORDS.some((k) => lower.includes(k))
}

/**
 * High-signal compression pass over a list of raw scraped text blocks.
 * Returns a single joined string of only the land-relevant sentences.
 */
export function compressScrapedContext(rawTextList: string[]): string {
  const leanSentences: string[] = []
  const seen = new Set<string>()

  for (const block of rawTextList) {
    const stripped = stripMarkupAndWhitespace(block)
    for (const sentence of splitSentences(stripped)) {
      if (!containsSignal(sentence)) continue
      const dedupeKey = sentence.toLowerCase()
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      leanSentences.push(sentence)
    }
  }

  // Safety cap so a runaway scrape can never blow the ASI:One context budget.
  return leanSentences.slice(0, 120).join(' ')
}

/** Compression ratio for Arize logging / demo narration ("we shrank X→Y"). */
export function compressionStats(raw: string[], compressed: string) {
  const rawChars = raw.reduce((n, b) => n + b.length, 0)
  const ratio = rawChars === 0 ? 1 : compressed.length / rawChars
  return {
    rawChars,
    compressedChars: compressed.length,
    ratio: Number(ratio.toFixed(3)),
  }
}
