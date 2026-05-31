import Anthropic from 'npm:@anthropic-ai/sdk@0.36.3'
// deno-lint-ignore no-explicit-any
import libheifModule from 'npm:libheif-js/wasm-bundle.js'
import jpegJs from 'npm:jpeg-js'

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

// libheif-js/wasm-bundle exports a Promise<Module> (emscripten async init).
// Cache it at the module level so the WASM is only loaded once per isolate.
// deno-lint-ignore no-explicit-any
const libheifReady: Promise<any> = Promise.resolve(libheifModule)

function nearestNeighborResize(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  maxPx: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxPx / Math.max(srcW, srcH))
  if (scale === 1) return { data: src, width: srcW, height: srcH }
  const dstW = Math.round(srcW * scale)
  const dstH = Math.round(srcH * scale)
  const dst = new Uint8ClampedArray(dstW * dstH * 4)
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(Math.floor(dx / scale), srcW - 1)
      const sy = Math.min(Math.floor(dy / scale), srcH - 1)
      const si = (sy * srcW + sx) * 4
      const di = (dy * dstW + dx) * 4
      dst[di] = src[si]
      dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]
      dst[di + 3] = src[si + 3]
    }
  }
  return { data: dst, width: dstW, height: dstH }
}

async function convertHeicToJpegDataUri(heicDataUri: string): Promise<string> {
  const parsed = parseDataUri(heicDataUri)
  if (!parsed) throw new Error('Invalid HEIC data URI')

  const bytes = Uint8Array.from(atob(parsed.base64Data), (c) => c.charCodeAt(0))

  // deno-lint-ignore no-explicit-any
  const libheif: any = await libheifReady
  const decoder = new libheif.HeifDecoder()
  const images = decoder.decode(bytes)
  if (!images?.length) throw new Error('No images decoded from HEIC')

  const image = images[0]
  const width: number = image.get_width()
  const height: number = image.get_height()

  const rgbaData = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) => {
    // deno-lint-ignore no-explicit-any
    image.display({ data: rgbaData, width, height }, (result: any) => {
      if (result) resolve()
      else reject(new Error('HEIC display callback failed'))
    })
  })

  const { data: resized, width: w, height: h } = nearestNeighborResize(rgbaData, width, height, 1024)

  const { data: jpegBytes } = jpegJs.encode({ data: resized, width: w, height: h }, 85)

  let binary = ''
  new Uint8Array(jpegBytes).forEach((b: number) => { binary += String.fromCharCode(b) })
  return `data:image/jpeg;base64,${btoa(binary)}`
}

function isHeicDataUri(uri: string): boolean {
  return /^data:image\/hei[cf];base64,/i.test(uri)
}

async function prepareImages(rawUris: string[]): Promise<string[]> {
  return Promise.all(
    rawUris.map(async (uri) => {
      if (!isHeicDataUri(uri)) return uri
      try {
        return await convertHeicToJpegDataUri(uri)
      } catch (e) {
        console.error('[scan-refuel] HEIC conversion failed:', e)
        return uri  // pass through; toImageSource will filter it out
      }
    }),
  )
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
    // Strip optional markdown code fence that Claude sometimes adds despite instructions
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

  let rawImages: string[]

  try {
    const body = await req.json()
    if (!Array.isArray(body.images) || body.images.length === 0) {
      return jsonResponse({ error: 'At least one image is required' }, 400)
    }
    rawImages = body.images.filter((i: unknown) => typeof i === 'string')
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const client = new Anthropic({ apiKey: anthropicApiKey })

  // Convert any HEIC/HEIF images to JPEG before passing to Claude.
  const images = await prepareImages(rawImages)

  const result = await extractAll(client, images)
  return jsonResponse(result)
})
