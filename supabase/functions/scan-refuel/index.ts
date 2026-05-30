import Anthropic from 'npm:@anthropic-ai/sdk@0.36.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Confidence = 'high' | 'low' | 'none'

interface ScanResult {
  odometer?: number
  liters?: number
  total_cost?: number
  confidence: {
    odometer: Confidence
    liters: Confidence
    total_cost: Confidence
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseDataUri(dataUri: string): { mediaType: string; base64Data: string } | null {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], base64Data: match[2] }
}

function toImageSource(dataUri: string): Anthropic.Base64ImageSource | null {
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

async function extractOdometer(
  client: Anthropic,
  imageDataUri: string,
): Promise<{ value?: number; confidence: Confidence }> {
  const source = toImageSource(imageDataUri)
  if (!source) return { confidence: 'none' }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source },
          {
            type: 'text',
            text: `Extract the odometer reading from this image.
Rules:
- Return the numeric value only (integer, no units, no commas).
- confidence "high": digits are clear and unambiguous.
- confidence "low": digits are partially visible, blurry, or estimated.
- confidence "none": odometer not visible or unreadable.
Respond ONLY with valid JSON, no markdown, no explanation:
{"value": 123456, "confidence": "high"}`,
          },
        ],
      },
    ],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const parsed = JSON.parse(text)
    const confidence: Confidence = ['high', 'low', 'none'].includes(parsed.confidence)
      ? parsed.confidence
      : 'none'
    const value = typeof parsed.value === 'number' ? Math.round(parsed.value) : undefined
    return { value, confidence }
  } catch {
    return { confidence: 'none' }
  }
}

async function extractReceipt(
  client: Anthropic,
  imageDataUri: string,
): Promise<{
  liters?: number
  total_cost?: number
  litersConfidence: Confidence
  totalCostConfidence: Confidence
}> {
  const source = toImageSource(imageDataUri)
  if (!source) return { litersConfidence: 'none', totalCostConfidence: 'none' }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source },
          {
            type: 'text',
            text: `Extract fuel volume and total cost from this pump display or receipt.
Rules:
- Return numeric values only (no units, no currency symbols).
- If the receipt shows gallons, convert to liters (1 gallon = 3.785 liters).
- total_cost is the total amount paid, not the per-litre price.
- confidence "high": value is clearly legible and unambiguous.
- confidence "low": value is partially visible, blurry, or estimated.
- confidence "none": value not present or unreadable.
Respond ONLY with valid JSON, no markdown, no explanation:
{"liters": 45.2, "liters_confidence": "high", "total_cost": 89.50, "total_cost_confidence": "high"}`,
          },
        ],
      },
    ],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const parsed = JSON.parse(text)

    const litersConf: Confidence = ['high', 'low', 'none'].includes(parsed.liters_confidence)
      ? parsed.liters_confidence
      : 'none'
    const totalCostConf: Confidence = ['high', 'low', 'none'].includes(
      parsed.total_cost_confidence,
    )
      ? parsed.total_cost_confidence
      : 'none'

    return {
      liters: typeof parsed.liters === 'number' ? parsed.liters : undefined,
      total_cost: typeof parsed.total_cost === 'number' ? parsed.total_cost : undefined,
      litersConfidence: litersConf,
      totalCostConfidence: totalCostConf,
    }
  } catch {
    return { litersConfidence: 'none', totalCostConfidence: 'none' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Validate user JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authCheck = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: supabaseAnonKey,
    },
  })

  if (!authCheck.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Parse body
  let odometerImage: string | undefined
  let receiptImage: string | undefined

  try {
    const body = await req.json()
    odometerImage = typeof body.odometerImage === 'string' ? body.odometerImage : undefined
    receiptImage = typeof body.receiptImage === 'string' ? body.receiptImage : undefined
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!odometerImage && !receiptImage) {
    return jsonResponse({ error: 'At least one image is required' }, 400)
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const client = new Anthropic({ apiKey: anthropicApiKey })

  const result: ScanResult = {
    confidence: { odometer: 'none', liters: 'none', total_cost: 'none' },
  }

  if (odometerImage) {
    const { value, confidence } = await extractOdometer(client, odometerImage)
    if (value !== undefined) result.odometer = value
    result.confidence.odometer = confidence
  }

  if (receiptImage) {
    const { liters, total_cost, litersConfidence, totalCostConfidence } = await extractReceipt(
      client,
      receiptImage,
    )
    if (liters !== undefined) result.liters = liters
    if (total_cost !== undefined) result.total_cost = total_cost
    result.confidence.liters = litersConfidence
    result.confidence.total_cost = totalCostConfidence
  }

  return jsonResponse(result)
})
