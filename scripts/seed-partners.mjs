#!/usr/bin/env node
/**
 * Seed contractor partner data into Redis from data/partners.seed.json.
 *
 * Usage:
 *   node scripts/seed-partners.mjs           # write all 318 keys
 *   node scripts/seed-partners.mjs --dry-run # preview without writing
 *
 * Requires REDIS_URL to be set (loaded from .env at project root if present).
 */

import { readFileSync, existsSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const Redis = require('ioredis')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
const envPath = join(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k && !(k in process.env)) process.env[k] = v
  }
}

// ---------------------------------------------------------------------------
// Category keyword inference — used when category is a mis-scraped rating
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS = [
  [/plumb/i, 'Plumbing'],
  [/electric/i, 'Electrical'],
  [/roof/i, 'Roofing'],
  [/hvac|heat(ing)?|air.?cond|a\/?c\b/i, 'HVAC'],
  [/landscap|lawn|garden/i, 'Landscaping'],
  [/paint/i, 'Painting'],
  [/floor/i, 'Flooring'],
  [/remodel|renovat/i, 'Remodeling'],
  [/concrete|foundati/i, 'Concrete'],
  [/fram(ing)?|carpent/i, 'Carpentry'],
  [/drywall|stucco/i, 'Drywall'],
  [/tile/i, 'Tile & Stone'],
  [/insulat/i, 'Insulation'],
  [/window|door/i, 'Windows & Doors'],
  [/paving|asphalt/i, 'Paving'],
  [/masonry|brick/i, 'Masonry'],
  [/excavat|grading/i, 'Excavation'],
  [/pool|spa\b/i, 'Pool & Spa'],
  [/solar/i, 'Solar'],
]

function inferCategory(name) {
  for (const [pattern, label] of CATEGORY_KEYWORDS) {
    if (pattern.test(name || '')) return label
  }
  return 'General Contractor'
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function fixCategory(entry) {
  const cat = String(entry.category ?? '').trim()
  // If category looks like a numeric rating ("5.0", "4", "3.5") it was
  // mis-scraped into the wrong field — infer a real label from the name.
  if (!cat || /^\d+(\.\d+)?$/.test(cat)) {
    return { ...entry, category: inferCategory(entry.name) }
  }
  return entry
}

function dedupeAddress(addr, phone) {
  if (!addr) return addr
  const phoneDigs = (phone ?? '').replace(/\D/g, '')
  const parts = addr.split('·').map(s => s.trim()).filter(Boolean)
  const seen = new Set()
  const result = []

  for (const part of parts) {
    // Skip pure-numeric ratings ("5.0", "4")
    if (/^\d+(\.\d+)?$/.test(part)) continue
    // Skip phone numbers
    const digs = part.replace(/\D/g, '')
    if (digs.length >= 10 && (digs === phoneDigs || /^\(?(\d{3})\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(part))) continue
    // Skip status / hours tokens
    if (/^(Closed|Open(s)?|Closes?|Opens?)\b/i.test(part)) continue
    if (/\b\d+\s*(am|pm)\b/i.test(part) && !/\b\d+\s+\w+\s+(Ave|St|Rd|Blvd|Dr|Ln|Way|Ct|Pl)\b/i.test(part)) continue
    // Strip trailing concatenated status word ("200 W 34th Ave suite 32Closed")
    const clean = part.replace(/(Closed|Open(s)?)$/i, '').trim()
    if (!clean) continue
    const key = clean.toLowerCase().replace(/\s+/g, ' ')
    if (!seen.has(key)) {
      seen.add(key)
      result.push(clean)
    }
  }

  const joined = result.join(', ')
  return joined || addr
}

function normalize(entry) {
  const withCategory = fixCategory(entry)
  return {
    ...withCategory,
    address: dedupeAddress(withCategory.address, withCategory.phone),
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[seed] DRY RUN — no writes will occur\n')

  const seedPath = join(ROOT, 'data', 'partners.seed.json')
  if (!existsSync(seedPath)) {
    console.error(`[seed] Seed file not found: ${seedPath}`)
    process.exit(1)
  }
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'))
  const allKeys = Object.keys(seed)
  console.log(`[seed] Loaded ${allKeys.length} regions (${seedPath})`)

  const url = process.env.REDIS_URL?.trim().replace(/^["']|["']$/g, '')
  if (!url) {
    console.error('[seed] REDIS_URL is not set — set it in .env or as an env var')
    process.exit(1)
  }

  const redis = new Redis(url, { maxRetriesPerRequest: 2 })
  redis.on('error', (err) => console.error('[redis]', err.message))

  let writtenKeys = 0
  let totalPartners = 0
  const categoryFixes = { fixed: 0, unchanged: 0 }

  for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
    const batch = allKeys.slice(i, i + BATCH_SIZE)
    const pipeline = DRY_RUN ? null : redis.pipeline()

    for (const key of batch) {
      const raw = seed[key]
      const entries = Array.isArray(raw) ? raw : []
      const normalized = entries.map(e => {
        const n = normalize(e)
        if (n.category !== e.category) categoryFixes.fixed++
        else categoryFixes.unchanged++
        return n
      })
      totalPartners += normalized.length

      if (pipeline) {
        pipeline.set(key, JSON.stringify(normalized))
      } else {
        // dry-run: just log first few
        if (i === 0 && batch.indexOf(key) < 3) {
          console.log(`  [dry] SET ${key} — ${normalized.length} partners, sample category: "${normalized[0]?.category}"`)
        }
      }
    }

    if (pipeline) {
      await pipeline.exec()
      writtenKeys += batch.length
    }

    const done = Math.min(i + BATCH_SIZE, allKeys.length)
    process.stdout.write(`\r[seed] Progress: ${done}/${allKeys.length} regions`)
  }

  console.log('\n')
  console.log(`[seed] Category fixes applied : ${categoryFixes.fixed}`)
  console.log(`[seed] Category already clean : ${categoryFixes.unchanged}`)
  console.log(`[seed] Total partners         : ${totalPartners}`)
  if (DRY_RUN) {
    console.log(`[seed] DRY RUN — would write  : ${allKeys.length} keys`)
  } else {
    console.log(`[seed] Keys written           : ${writtenKeys}`)
    console.log('[seed] Done ✓')
  }

  await redis.quit()
}

main().catch(err => {
  console.error('[seed] Fatal:', err)
  process.exit(1)
})
