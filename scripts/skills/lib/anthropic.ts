/**
 * Minimal Anthropic Messages API helper for the Tier 3 skill evals.
 * Uses global fetch (Node 20+) — no SDK dependency.
 *
 * Model ids (Jan 2026): Opus 4.8 = 'claude-opus-4-8', Haiku 4.5 =
 * 'claude-haiku-4-5-20251001'. Use Haiku for cheap classification, Opus for the
 * reasoning-sensitive INSERT eval.
 */
const API = 'https://api.anthropic.com/v1/messages'

export function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    console.error('✗ ANTHROPIC_API_KEY is not set — cannot run evals.')
    process.exit(1)
  }
  return key
}

export async function ask(opts: {
  apiKey: string
  model: string
  system?: string
  prompt: string
  maxTokens?: number
}): Promise<string> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  })
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as { content: { type: string; text?: string }[] }
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
}

/** Pull the first JSON object out of a model response (tolerates ``` fences). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`no JSON object in response: ${text.slice(0, 200)}`)
  return JSON.parse(raw.slice(start, end + 1)) as T
}
