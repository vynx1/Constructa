import Anthropic from '@anthropic-ai/sdk'
import { asiComplete, hasAsiKey } from '~/lib/asi'

// ---------------------------------------------------------------------------
// LLM entrypoint. Construca now uses ASI:One as its universal LLM (per the
// revised plan) — Anthropic is OPTIONAL. `complete()` resolution order:
//   1. ASI:One  (ASI_ONE_API_KEY)            — the default path now.
//   2. Anthropic (ANTHROPIC_API_KEY)         — only if ASI is unset but
//      Anthropic is configured (kept for backward compatibility).
//   3. Mock string                           — neither configured.
//
// What the LLM is used for: project redesign plans (`/api/project/:id/redesign`),
// RFI cited answers (`/api/agents/rfi`), and one-sentence district justifications
// during the offline scoring pass. None of these require Anthropic specifically —
// ASI:One covers all of them through the OpenAI-compatible endpoint.
// ---------------------------------------------------------------------------

let client: Anthropic | null = null

export function getClaude(): Anthropic | null {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  client = new Anthropic({ apiKey })
  return client
}

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-4-8'

/** Single-turn completion. Prefers ASI:One; falls back to Anthropic, then mock. */
export async function complete(prompt: string, system?: string): Promise<string> {
  // 1. ASI:One — the universal LLM for Construca.
  if (hasAsiKey()) {
    return asiComplete(prompt, system)
  }

  // 2. Anthropic — only if explicitly configured and ASI is not.
  const anthropic = getClaude()
  if (anthropic) {
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

  // 3. Neither configured.
  return `[mock LLM response — set ASI_ONE_API_KEY to enable]\n\n${prompt.slice(0, 200)}`
}
