import Redis from 'ioredis'

// Server-only. Lazily creates a single shared ioredis client. If REDIS_URL is
// unset the client is null and callers fall back to mock/cached data so the
// app stays runnable without infrastructure.
let client: Redis | null = null

export function getRedis(): Redis | null {
  if (client) return client
  const url = process.env.REDIS_URL
  if (!url) return null
  client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 })
  client.on('error', (err) => {
    console.error('[redis] connection error:', err.message)
  })
  return client
}

// Centralized key design — see BUILD_PLAN §6 "Redis key design".
export const keys = {
  project: (id: string) => `project:${id}`,
  projectSequence: (id: string) => `project:${id}:sequence`,
  projectCurrentStep: (id: string) => `project:${id}:current_step`,
  projectRedesign: (id: string) => `project:${id}:redesign`,
  ragCodes: () => `rag:codes`,
  claudeCache: (hash: string) => `cache:claude:${hash}`,
  mapCounty: (fips: string) => `map:county:${fips}`,
} as const
