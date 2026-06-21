# Construca — Interactive Map & Deep-Dive Workspace

This document covers the **map system**: the interactive choropleth, the
automated deep-dive scraping pipeline, the ASI:One multi-agent routing engine,
and — importantly — **how to set up every API and where each environment key
goes**. It implements the revised master plan and folds back in the BUILD_PLAN
design pieces that the master plan left implicit (see §7).

> **Token Company removed.** Per the revised spec, compressed Browserbase output
> pipes **directly** into ASI:One. The compression now happens locally, in
> `src/lib/compression.ts` — no third-party middleware hop.

---

## 1. The end-to-end flow

| Phase | Trigger | Frontend | Backend | Redis key |
|---|---|---|---|---|
| 1. Regional heatmap | Map mounts / hover state | `MapViewport` renders US states, color-pops on hover | `GET /api/map/states` serves state scores | `map:state:{code}` |
| 2. State focus | Click a state | Fit to state bounds; draw **congressional-district** dividing lines + a dense zip-level heatmap clipped to the outline | `GET /api/map/state/:code/regions`, `/state/:code/heatmap` | `map:state:{code}:regions` / `:cells` |
| 3. Region select + deep-dive | Click a district → "Explore This Area" | Async mutation + smooth-scroll to panel | `POST /api/map/region/:regionId/deep-dive` → Browserbase listings + scrape | `map:region:{id}:listings`, `session:{id}:raw_scrapes` |
| 4. Agent consensus | Panel lands in view | Carousel + factor scale fill in | ASI:One builds the factor-scored buy/hold/avoid guide | `cache:asi:guide:{hash}` |
| 5. Save / transition | "Save plot" / "Initiate Construction Build" | Like → Redis; CTA stashes region, routes to `/product` | Liked store + project bootstrap | `liked:plots`, `project:{new_id}` |

### Code map

```
src/lib/mapData.ts        # seeded state/district/grid/guide cache (frozen records)
src/lib/mapClient.ts      # client fetchers + score→color ramp
src/lib/compression.ts    # local semantic compression (replaces Token Company)
src/lib/browserbase.ts    # §3B headless scrape pipeline (env-guarded)
src/lib/asi.ts            # §3C ASI:One client + Agentverse fallback + Arize logs
src/lib/arize.ts          # observability logger / fallback trigger
src/server/api.ts         # /api/map/* routes incl. the stage-safe deep-dive bridge

src/components/map/MapViewport.tsx            # §2A multi-level choropleth
src/components/map/FloatingActionDrawer.tsx   # §2A "Explore This Area" CTA
src/components/map/DeepDiveResearchPanel.tsx  # §2B properties + insights
src/routes/map/index.tsx                      # composes the two + scroll/mutation
```

---

## 2. Running it with zero keys

```bash
npm install
cp .env.example .env     # optional — leave keys blank for the mock path
npm run dev              # http://localhost:3000/map
```

With no keys: state scores, district grids, properties, and the buying guide all
serve from the seeded cache in `src/lib/mapData.ts`. The deep-dive "Live mode"
toggle is OFF by default (the **stage-safe** path), so a presentation never
stalls on a live network call.

---

## 3. The stage-safe execution model (master plan §4)

The deep-dive route is wrapped in a graceful-degradation loop:

- **Live mode OFF** (`x-live-mode: false`, default) → returns the frozen,
  pre-generated record from `data:pre_generated:cache:{district}` (or the seed).
  Instant, deterministic, demo-safe.
- **Live mode ON** → runs the real Browserbase scrape + ASI:One synthesis. If
  **anything** throws (network, parse, timeout), it automatically drops back to
  the frozen record. The user never sees an error.

Toggle "Live mode" in the research-panel header to switch paths on stage.

---

## 4. API setup — one section per key

Each integration is independent. Wire only the ones you want live; the rest stay
on the mock path. **All web-app keys go in the root `.env`** (copy from
`.env.example`). Agent-service keys go in `agent-service/.env`.

### 4.1 Redis  → `REDIS_URL`

Backs `map:state:*`, `map:district:*`, `session:*:raw_scrapes`, and
`cache:asi:guide:*`.

- **Local (Docker):** `docker compose up redis` → `redis://localhost:6379`
- **Local (brew):** `brew install redis && brew services start redis`
- **Hosted:** [Upstash](https://upstash.com/) or Redis Cloud → copy the
  `redis://` / `rediss://` connection string.

```dotenv
# .env
REDIS_URL=redis://localhost:6379
```

Seeding the cache (optional — makes the frozen path read from Redis instead of
the in-code seed): write each district's record to `map:district:{id}` and its
pre-generated guide to `data:pre_generated:cache:{id}`. The shapes are exactly
what `src/lib/mapData.ts` exports.

### 4.2 Browserbase  → `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`

Real headless scraping for the live deep-dive (§3B). **Already wired** in
`src/lib/browserbase.ts` — no uncommenting needed.

1. Sign up at <https://www.browserbase.com/>.
2. Dashboard → **Settings** → copy your **API Key** and **Project ID**.
3. The SDK + driver are already installed (`@browserbasehq/sdk`,
   `playwright-core`). They're declared **server-external** in `vite.config.ts`
   (`optimizeDeps.exclude` + `ssr.external`) because `playwright-core` ships a
   native `fsevents` binary the dev bundler can't pre-bundle.

```dotenv
# .env
BROWSERBASE_API_KEY=bb_live_xxxxxxxx
BROWSERBASE_PROJECT_ID=xxxxxxxx-xxxx-xxxx
```

Without these, the pipeline returns realistic mock parcels + scrape blocks.

#### How the live scraping works (the mental model)

Browserbase gives you a **cloud Chrome** you drive remotely with Playwright. The
flow, all in `withBrowserbasePage()`:

```text
1. bb.sessions.create({ projectId, proxies: true })   // cloud browser + residential IP
2. chromium.connectOverCDP(session.connectUrl)         // Playwright attaches over CDP
3. page.goto(url) → page.waitForTimeout() → page.evaluate(extract)
4. browser.close()  (always, in finally)
```

`proxies: true` routes through residential IPs so listing/gov sites don't block
the bot — that's the whole reason to use Browserbase instead of raw Playwright.

Two real scrape targets are wired:

- **`liveScrapeLandListings(regionId)`** → loads
  `https://www.landsearch.com/properties/{zip}`, reads every `article.preview`
  card, and pulls price, acreage, `data-context` lat/lng, gallery photo, and the
  listing link. Normalized into `LandListing[]` (the carousel). LandSearch was
  chosen because its cards are clean and its photos sit on a public CDN
  (`cdn.landsearch.com`) that renders directly in an `<img>`.
- **`liveScrapeBlocks(regionId)`** → queries DuckDuckGo's HTML endpoint
  (`html.duckduckgo.com/html/?q=…`, JS-free and scrape-friendly) for the region's
  permit/zoning/sentiment signal and returns the result snippets. These become
  the research records that compression + ASI:One reason over.

Both are **best-effort**: any failure (anti-bot, selector drift, timeout) is
caught and the caller falls back to the deterministic mock so the demo never
breaks. To point at a different site, edit the `page.goto` URL + the
`page.evaluate` selectors — that's the only part that's site-specific.

> **To run a scrape yourself for debugging:** the simplest harness is a `.mjs`
> file **inside the repo root** (so it resolves `node_modules`), parse `.env`
> by hand, call `bb.sessions.create` → `connectOverCDP` → `page.goto` →
> `page.evaluate(...)`, and `console.log` what you get back. Iterate on the
> selectors against the live DOM before moving them into `browserbase.ts`.

### 4.3 Fetch.ai ASI:One  → `ASI_ONE_API_KEY` (+ base URL / model)

The universal router that synthesizes the buying guide and falls back to the
Agentverse marketplace (§3C, BUILD_PLAN §3).

1. Create an account at <https://asi1.ai/> (or <https://agentverse.ai/>).
2. Developer dashboard → **API Keys** → create one (`sk_...`).
3. ASI:One is OpenAI-compatible — `src/lib/asi.ts` calls
   `POST {BASE}/chat/completions`. The base URL rarely changes.

```dotenv
# .env
ASI_ONE_API_KEY=sk_xxxxxxxx
ASI_ONE_BASE_URL=https://api.asi1.ai/v1
# Valid chat models: asi1, asi1-mini, asi1-ultra. (NOT asi1-agentic — that is
# rejected on this endpoint with "Unsupported model".)
ASI_ONE_MODEL=asi1
```

> **Two gotchas this client already handles** (learned wiring the live key):
> 1. Every request **must** send an `x-session-id` header — without it the API
>    returns `422 missing header x-session-id`. `asiChat()` sends a fresh UUID.
> 2. The model must be `asi1` / `asi1-mini` / `asi1-ultra`. The default is `asi1`.

Fallback behavior: a native ASI:One timeout/failure triggers
`agentverseFallback`, which instructs the router to find a
`land_compliance_experts` agent on Agentverse and delegate to it. Every branch
is logged through Arize. The **stage-safe default path** (`seededGuide`) never
calls the network — it returns a deterministic, non-zero, factor-scored guide,
so the panel is instant. Only "Live mode" runs the real ASI synthesis.

### 4.4 Arize  → `ARIZE_API_KEY`, `ARIZE_SPACE_ID`

Observability + the **fallback trigger** (a failed/low-confidence span is what
moves a call onto the ASI:One path — BUILD_PLAN §3 step 2).

1. Sign up at <https://app.arize.com/>.
2. **Space Settings** → copy **Space ID** + **API Key**.

```dotenv
# .env
ARIZE_API_KEY=xxxxxxxx
ARIZE_SPACE_ID=xxxxxxxx
```

Without keys, spans print to stdout (`[arize:success]`, `[arize:fallback]`) so
the routing story is still visible during a demo.

### 4.5 LLM  → ASI:One (Anthropic now optional)

Construca's universal LLM is **ASI:One**. `src/lib/claude.ts` `complete()` —
used by `/api/project/:id/redesign`, `/api/agents/rfi`, and district
justifications — resolves in this order:

1. **ASI:One** (`ASI_ONE_API_KEY`) — the default. No Anthropic key needed.
2. **Anthropic** (`ANTHROPIC_API_KEY`) — only if set and ASI is not.
3. Mock string — neither configured.

So you can leave `ANTHROPIC_API_KEY` blank entirely; the same ASI:One key above
powers every text generation in the app. Set Anthropic only if you specifically
want Claude for these calls.

```dotenv
# .env — optional; leave blank to route all LLM calls through ASI:One
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
# CLAUDE_MODEL=claude-opus-4-8
```

### 4.6 Agent service  → `AGENT_SERVICE_URL`

Where `/api/agents/*` proxies. Defaults to `http://localhost:8000`. The
agent-service has its **own** `.env` (`agent-service/.env`) for the keys it uses
directly (ASI:One, Browserbase, Arize, the uAgent seed).

---

## 5. Quick verification

```bash
# Mock path (no keys needed)
curl localhost:3000/api/map/states | jq '.source, .states[0]'
curl localhost:3000/api/map/district/ca-sd/grids | jq '.grids | length'

# Stage-safe deep-dive (frozen record)
curl -XPOST localhost:3000/api/map/district/ca-sd/deep-dive \
  -H 'content-type: application/json' -d '{"projectType":"mixed_use"}' | jq '.guide.source'

# Live deep-dive (set keys first; falls back to frozen on any failure)
curl -XPOST localhost:3000/api/map/district/ca-sd/deep-dive \
  -H 'x-live-mode: true' -H 'content-type: application/json' \
  -d '{"projectType":"mixed_use"}' | jq '.live, .guide.source'
```

---

## 6. Data shapes

```text
map:state:{code}                  Hash  { aggregate_score, regulatory_density }
map:district:{id}                 JSON  { center, regionalName, aggregateConsensusScore, ... }
map:district:{id}:grids           JSON  [ { coordinates:[lng,lat], score } ]
rag:district:{id}                 Vector index of district research docs (scoring grounding)
session:{id}:raw_scrapes          List  [ raw Browserbase text blocks ]
cache:asi:guide:{prompt_hash}     String JSON buying guide (TTL 7200s)
data:pre_generated:cache:{id}     String frozen guide for the stage-safe path
```

---

## 7. BUILD_PLAN pieces folded back in (beyond the master plan)

The master plan optimized for the live demo path; these BUILD_PLAN §4 design
elements were re-incorporated so the system is defensible, not just demoable:

1. **Three weighted sub-scores.** The consensus score is meant to decompose into
   *regulatory velocity*, *zoning availability*, and *community sentiment*. The
   seed data + guide fields (`permits`, `zoning`, `crowd_demands`) already carry
   these; the scoring agent prompt in `src/lib/asi.ts` returns a unified
   `consensusScore` rollup of them.

2. **Non-buildable land exclusion (hard filter, not a penalty).** Tribal,
   military, and protected land is excluded from the buildable pool *before*
   scoring. Surfaced as `buildablePct` on every district and shown in the
   floating action drawer. Replace the seeded percentages with real CalEPA/CNRA
   tribal-lands + DoD GIS layers when wiring production data.

3. **Vector RAG over district docs (`rag:district:{id}`).** The key is reserved
   so similar districts retrieve similar prior scoring rationale — this is what
   keeps neighboring-district scores consistent without re-scraping on every
   load. Embed the `session:{id}:raw_scrapes` blocks into this index in the
   offline pass.

4. **Claude one-sentence justification.** `src/lib/claude.ts` (`complete`) is
   already available to attach a short natural-language justification to each
   `map:district:{id}` record during the offline scoring pass.

5. **Live "refresh this district" action.** `POST /api/map/district/:id/refresh`
   re-runs the full Browserbase + ASI:One pass on stage as a bonus moment,
   independent of the cached default map experience.

6. **County level (Level 3).** The master plan stops at state → district; the
   BUILD_PLAN drills one further to county. The data plane already supports it
   (`GET /api/map/county/:fips`, `map:county:{fips}`); add a third `ZoomLevel`
   and a `GeoJsonLayer` county choropleth to `MapViewport` to expose it.

7. **Arize as the explicit fallback trigger.** Not just passive logging — a
   failed/low-confidence Arize span is the documented condition that moves a
   call from the native path to ASI:One/Agentverse.
```
