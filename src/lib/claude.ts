import Anthropic from '@anthropic-ai/sdk'

// Server-only. Lazily creates the Anthropic client. Returns null when no API
// key is configured so the API layer can serve mock responses in dev.
let client: Anthropic | null = null

export function getClaude(): Anthropic | null {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  client = new Anthropic({ apiKey })
  return client
}

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-4-8'

/**
 * Thin wrapper for a single-turn completion. Real flows (redesign, sequence,
 * RFI) add the Redis semantic cache + streaming on top of this — see
 * BUILD_PLAN §6 "Tooling per service".
 */
export async function complete(prompt: string, system?: string): Promise<string> {
  const anthropic = getClaude()
  if (!anthropic) {
    return `[mock claude response — set ANTHROPIC_API_KEY to enable]\n\n${prompt.slice(0, 200)}`
  }
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}
