import Anthropic from 'npm:@anthropic-ai/sdk@0.36.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Confidence = 'high' | 'low' | 'none'

interface ScanResult {
  odometer?: number  // km (metric-normalised)
  volume?: number    // liters (metric-normalised)
  total_cost?: number
  confidence: {
    odometer: Confidence
    volume: Confidence
    total_cost: Confidence
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function parseDataUri(dataUri: string): { mediaType: string; base64Data: string } | null {
  const match = dataUri.match(/^data:(image\/[\w.+-]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], base64Data: match[2] }
}

export function toImageSource(dataUri: string): Anthropic.Base64ImageSource | null {
  const parsed = parseDataUri(dataUri)
  if (!parsed) return null
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!validTypes.includes(parsed.mediaType)) return null
  return {
    type: 'base64',
    media_type: parsed.mediaType as Anthropic.Base64ImageSource['media_type'],
    data: parsed.base64Data,
  }
}

async function extractAll(client: Anthropic, imageDataUris: string[]): Promise<ScanResult> {
  const fallback: ScanResult = {
    confidence: { odometer: 'none', volume: 'none', total_cost: 'none' },
  }

  const imageBlocks: Anthropic.MessageParam['content'] = imageDataUris
    .map((uri) => {
      const source = toImageSource(uri)
      if (!source) return null
      return { type: 'image' as const, source }
    })
    .filter((b): b is { type: 'image'; source: Anthropic.Base64ImageSource } => b !== null)

  if (imageBlocks.length === 0) return fallback

  const prompt = `You are analysing photos taken at a fuel stop. You may have 1–5 images.
Each image may show an odometer, a fuel pump display, a paper receipt, or something else.

Extract from ALL images combined and normalize to metric units:
- odometer: integer km reading. If the reading is in miles, multiply by 1.609344 and round to the nearest integer.
- volume: decimal liters dispensed. If the reading is in gallons, multiply by 3.785411.
- total_cost: decimal total amount paid in USD (not the per-unit price).

Respond ONLY with valid JSON, no markdown, no explanation:
{"odometer":54321,"volume":42.5,"total_cost":68.40,"confidence":{"odometer":"high","volume":"high","total_cost":"low"}}

"high" = clearly readable, "low" = uncertain/inferred, "none" = not found.
Use null for numeric value when confidence is "none".`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 192,
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: prompt }],
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    // Strip optional markdown code fence that Claude sometimes adds
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(text)
    const conf = parsed.confidence ?? {}

    const toConf = (v: unknown): Confidence =>
      ['high', 'low', 'none'].includes(v as string) ? (v as Confidence) : 'none'

    const result: ScanResult = {
      confidence: {
        odometer: toConf(conf.odometer),
        volume: toConf(conf.volume),
        total_cost: toConf(conf.total_cost),
      },
    }

    if (typeof parsed.odometer === 'number') result.odometer = Math.round(parsed.odometer)
    if (typeof parsed.volume === 'number') result.volume = parsed.volume
    if (typeof parsed.total_cost === 'number') result.total_cost = parsed.total_cost

    return result
  } catch (e) {
    console.error('[scan-refuel] extractAll error:', e)
    return fallback
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authCheck = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: supabaseAnonKey },
  })

  if (!authCheck.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let images: string[]

  try {
    const body = await req.json()
    if (!Array.isArray(body.images) || body.images.length === 0) {
      return jsonResponse({ error: 'At least one image is required' }, 400)
    }
    images = body.images.filter((i: unknown) => typeof i === 'string')
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const client = new Anthropic({ apiKey: anthropicApiKey })
  const result = await extractAll(client, images)
  return jsonResponse(result)
})
