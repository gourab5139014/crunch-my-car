/**
 * Tier 3 — INSERT-correctness eval.
 *
 * Gives the model the full SKILL.md as context plus a golden set of extracted
 * receipt/odometer values, and asks it to produce the row it would INSERT into
 * legacy.refuelings (as JSON, for reliable checking rather than brittle SQL
 * parsing). Then asserts the honesty-critical behaviors DETERMINISTICALLY:
 *   - distance_mi = odometer − previous odometer
 *   - NO metric conversion (odometer stays miles, volume stays gallons)
 *   - user_id + vehicle_id set explicitly from facts.yaml
 *
 * Never touches the real legacy.refuelings table — it only inspects the row the
 * model proposes. Non-deterministic; a pass is a threshold, not a proof.
 *
 * Run: ANTHROPIC_API_KEY=… npx tsx scripts/skills/eval-insert.ts
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { ask, requireApiKey, extractJson } from './lib/anthropic.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = resolve(HERE, '../../.claude/skills/legacy-refuel-photo-entry/SKILL.md')
const FACTS = resolve(HERE, '../../.claude/skills/legacy-refuel-photo-entry/facts.yaml')
const GOLDENS = resolve(HERE, '../../evals/legacy-refuel/insert-goldens.json')
const MODEL = 'claude-opus-4-8'

type Golden = {
  name: string
  extracted: {
    date: string
    odometer_miles: number
    previous_odometer_miles: number
    volume_gal: number
    price_per_gal: number
    total_cost: number
    station: string
  }
  expect: Record<string, unknown>
}

async function main() {
  const apiKey = requireApiKey()
  const skill = await readFile(SKILL, 'utf8')
  const facts = parseYaml(await readFile(FACTS, 'utf8')) as {
    identifiers: { vehicle: { id: string }; user_id: string }
  }
  const goldens: Golden[] = JSON.parse(await readFile(GOLDENS, 'utf8'))
  const expectedVehicle = facts.identifiers.vehicle.id
  const expectedUser = facts.identifiers.user_id

  const system =
    'You are following a Claude Code skill exactly. Given the skill and a set of already-extracted ' +
    'values, output ONLY a JSON object of the row you would INSERT into legacy.refuelings ' +
    '(column name → value). Do not convert units. Do not add commentary.'

  let passed = 0
  const failures: string[] = []

  for (const g of goldens) {
    const out = await ask({
      apiKey,
      model: MODEL,
      system,
      maxTokens: 512,
      prompt:
        `SKILL:\n"""${skill}"""\n\n` +
        `Extracted values:\n${JSON.stringify(g.extracted, null, 2)}\n\n` +
        `Produce the JSON row for the legacy.refuelings INSERT.`,
    })
    const row = extractJson<Record<string, unknown>>(out)
    const errs: string[] = []

    const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
    const expectedDistance = g.extracted.odometer_miles - g.extracted.previous_odometer_miles

    if (num(row.distance_mi) !== expectedDistance) errs.push(`distance_mi ${row.distance_mi} ≠ ${expectedDistance}`)
    if (num(row.odometer) !== g.extracted.odometer_miles) errs.push(`odometer ${row.odometer} ≠ ${g.extracted.odometer_miles} (metric conversion?)`)
    if (num(row.volume_gal) !== g.extracted.volume_gal) errs.push(`volume_gal ${row.volume_gal} ≠ ${g.extracted.volume_gal} (converted to litres?)`)
    if (String(row.user_id) !== expectedUser) errs.push(`user_id not set to ${expectedUser}`)
    if (String(row.vehicle_id) !== expectedVehicle) errs.push(`vehicle_id not set to ${expectedVehicle}`)

    if (errs.length === 0) {
      passed++
      console.log(`  ✓ ${g.name}`)
    } else {
      failures.push(`  ✗ ${g.name}: ${errs.join('; ')}`)
    }
  }

  console.log(`\nINSERT eval: ${passed}/${goldens.length} goldens passed`)
  if (failures.length) console.log(failures.join('\n'))
  console.log('Note: sampled + non-deterministic — a pass is a threshold, not a proof.')

  if (passed < goldens.length) process.exit(1)
}

main().catch((err) => {
  console.error(`✗ INSERT eval hard-failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
