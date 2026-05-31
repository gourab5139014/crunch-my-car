// Deno test suite for scan-refuel Edge Function helpers.
// Run with: deno test supabase/functions/scan-refuel/index.test.ts
import { assertEquals, assertExists, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseDataUri, toImageSource } from './index.ts'

// ── parseDataUri ─────────────────────────────────────────────────────────────

Deno.test('parseDataUri: valid JPEG data URI', () => {
  const result = parseDataUri('data:image/jpeg;base64,/9j/abc123')
  assertExists(result)
  assertStrictEquals(result.mediaType, 'image/jpeg')
  assertStrictEquals(result.base64Data, '/9j/abc123')
})

Deno.test('parseDataUri: valid PNG data URI', () => {
  const result = parseDataUri('data:image/png;base64,iVBORw0KGgo=')
  assertExists(result)
  assertStrictEquals(result.mediaType, 'image/png')
})

Deno.test('parseDataUri: valid WebP data URI', () => {
  const result = parseDataUri('data:image/webp;base64,UklGRg==')
  assertExists(result)
  assertStrictEquals(result.mediaType, 'image/webp')
})

Deno.test('parseDataUri: plain string returns null', () => {
  assertEquals(parseDataUri('not-a-data-uri'), null)
})

Deno.test('parseDataUri: empty string returns null', () => {
  assertEquals(parseDataUri(''), null)
})

Deno.test('parseDataUri: missing base64 marker returns null', () => {
  assertEquals(parseDataUri('data:image/jpeg,/9j/abc'), null)
})

// ── toImageSource ─────────────────────────────────────────────────────────────

Deno.test('toImageSource: returns Base64ImageSource for JPEG', () => {
  const result = toImageSource('data:image/jpeg;base64,/9j/abc')
  assertExists(result)
  assertStrictEquals(result.type, 'base64')
  assertStrictEquals(result.media_type, 'image/jpeg')
  assertStrictEquals(result.data, '/9j/abc')
})

Deno.test('toImageSource: returns Base64ImageSource for PNG', () => {
  const result = toImageSource('data:image/png;base64,abc')
  assertExists(result)
  assertStrictEquals(result.media_type, 'image/png')
})

Deno.test('toImageSource: returns Base64ImageSource for GIF', () => {
  const result = toImageSource('data:image/gif;base64,R0lGODlh')
  assertExists(result)
  assertStrictEquals(result.media_type, 'image/gif')
})

Deno.test('toImageSource: returns null for unsupported TIFF type', () => {
  assertEquals(toImageSource('data:image/tiff;base64,abc'), null)
})

Deno.test('toImageSource: returns null for non-image data URI', () => {
  assertEquals(toImageSource('data:application/pdf;base64,abc'), null)
})

Deno.test('toImageSource: returns null for invalid URI', () => {
  assertEquals(toImageSource('not-a-uri'), null)
})

// ── Handler: auth & validation ────────────────────────────────────────────────

Deno.test('handler: returns 405 for GET requests', async () => {
  const { default: handler } = await import('./index.ts')
  const req = new Request('http://localhost/functions/v1/scan-refuel', { method: 'GET' })
  const res = await handler(req)
  assertStrictEquals(res.status, 405)
})

Deno.test('handler: returns 204 for OPTIONS preflight', async () => {
  const { default: handler } = await import('./index.ts')
  const req = new Request('http://localhost/functions/v1/scan-refuel', { method: 'OPTIONS' })
  const res = await handler(req)
  assertStrictEquals(res.status, 204)
  assertExists(res.headers.get('Access-Control-Allow-Origin'))
})

Deno.test('handler: returns 401 when Authorization header is missing', async () => {
  const { default: handler } = await import('./index.ts')
  const req = new Request('http://localhost/functions/v1/scan-refuel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ odometerImage: 'data:image/jpeg;base64,abc' }),
  })
  const res = await handler(req)
  assertStrictEquals(res.status, 401)
})

Deno.test('handler: returns 400 when body has no images', async () => {
  // Provide a valid-looking auth header; the auth check will fail (no real Supabase),
  // so we override fetch to simulate an authenticated user.
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 200 }))

  const { default: handler } = await import('./index.ts')
  const req = new Request('http://localhost/functions/v1/scan-refuel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-token',
    },
    body: JSON.stringify({}),
  })
  const res = await handler(req)
  assertStrictEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, 'At least one image is required')

  globalThis.fetch = originalFetch
})
