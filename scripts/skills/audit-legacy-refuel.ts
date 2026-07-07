/**
 * Tier 2 — scheduled fact-audit for the legacy-refuel-photo-entry skill.
 *
 * Verifies the external-world contracts a repo lint can't see: that the live
 * legacy Supabase project still matches facts.yaml (schema columns + the known
 * vehicle identifier). Read-only — it NEVER inserts.
 *
 * Not PR-blocking: needs a service-role key and the free-tier legacy project
 * auto-pauses (503 PGRST002 on wake). Meant to run on a schedule; drift is a
 * normal outcome that opens a GitHub issue, not a script failure.
 *
 * Scope / honest limits: with the service-role REST API we can verify column
 * *presence* (added/removed/renamed columns — the common drift) and identifier
 * existence. Deeper type/nullable/default drift still needs the manual §4
 * introspection query in SKILL.md — we log that so coverage isn't overstated.
 *
 * Run locally:
 *   LEGACY_SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/skills/audit-legacy-refuel.ts
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const HERE = dirname(fileURLToPath(import.meta.url))
const FACTS_PATH = resolve(HERE, '../../.claude/skills/legacy-refuel-photo-entry/facts.yaml')

type Column = { name: string; type: string; nullable?: boolean; default?: string }
type Facts = {
  legacy_project_ref: string
  legacy_schema: { name: string; tables: { refuelings: { columns: Column[] } } }
  identifiers: { vehicle: { id: string; label: string } }
}

const KEY = process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('✗ LEGACY_SUPABASE_SERVICE_ROLE_KEY is not set — cannot reach the legacy project.')
  process.exit(1)
}

/** Fetch with retry/backoff to wake a paused free-tier project (503 PGRST002). */
async function wakeFetch(url: string, init: RequestInit, attempts = 6): Promise<Response> {
  let lastStatus = 0
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init)
    lastStatus = res.status
    if (res.status !== 503) return res
    const waitMs = 2000 * (i + 1)
    console.error(`  project asleep (503), waking… retry ${i + 1}/${attempts} in ${waitMs}ms`)
    await new Promise((r) => setTimeout(r, waitMs))
  }
  throw new Error(`legacy project did not wake after ${attempts} attempts (last status ${lastStatus})`)
}

async function main() {
  const facts = parseYaml(await readFile(FACTS_PATH, 'utf8')) as Facts
  const ref = facts.legacy_project_ref
  const schema = facts.legacy_schema.name
  const base = `https://${ref}.supabase.co/rest/v1`
  const headers = { apikey: KEY!, Authorization: `Bearer ${KEY!}` }

  const drift: string[] = []

  // 1) refuelings column presence (service role bypasses RLS → a real row).
  const colRes = await wakeFetch(`${base}/refuelings?select=*&limit=1`, {
    headers: { ...headers, 'Accept-Profile': schema },
  })
  if (!colRes.ok) {
    throw new Error(`refuelings introspection failed: ${colRes.status} ${await colRes.text()}`)
  }
  const rows = (await colRes.json()) as Record<string, unknown>[]
  if (rows.length === 0) {
    drift.push('- `legacy.refuelings` returned no rows under service role — cannot verify columns (was the table truncated?).')
  } else {
    const live = new Set(Object.keys(rows[0]))
    const expected = facts.legacy_schema.tables.refuelings.columns.map((c) => c.name)
    const missing = expected.filter((c) => !live.has(c))
    const extra = [...live].filter((c) => !expected.includes(c))
    if (missing.length) drift.push(`- Columns in facts.yaml but **missing** from live \`legacy.refuelings\`: ${missing.join(', ')}`)
    if (extra.length) drift.push(`- Columns in live \`legacy.refuelings\` but **absent** from facts.yaml: ${extra.join(', ')}`)
  }

  // 2) known vehicle identifier still exists.
  const vid = facts.identifiers.vehicle.id
  const vRes = await wakeFetch(`${base}/vehicles?id=eq.${vid}&select=id,make,model`, {
    headers: { ...headers, 'Accept-Profile': schema },
  })
  if (!vRes.ok) {
    throw new Error(`vehicles lookup failed: ${vRes.status} ${await vRes.text()}`)
  }
  const vehicles = (await vRes.json()) as unknown[]
  if (vehicles.length === 0) {
    drift.push(`- Known vehicle_id \`${vid}\` (${facts.identifiers.vehicle.label}) no longer exists in \`legacy.vehicles\`.`)
  }

  // Report.
  const clean = drift.length === 0
  const report = clean
    ? `✅ legacy-refuel-photo-entry: no drift detected against facts.yaml (ref ${ref}).\n\n_Note: this audit checks column presence + identifier existence, not column types/defaults — run SKILL.md §4 for a full introspection._`
    : `### ⚠️ Skill drift: legacy-refuel-photo-entry\n\nThe live legacy project (\`${ref}\`) no longer matches \`facts.yaml\`:\n\n${drift.join('\n')}\n\nUpdate \`.claude/skills/legacy-refuel-photo-entry/facts.yaml\` + \`SKILL.md\` and bump \`last_verified\`.`

  console.log(report)

  // In CI, hand the result to the workflow (which opens/updates an issue).
  const ghOut = process.env.GITHUB_OUTPUT
  if (ghOut) {
    await writeFile(ghOut, `has_drift=${clean ? 'false' : 'true'}\n`, { flag: 'a' })
    await writeFile(resolve(HERE, 'drift-report.md'), report, 'utf8')
  }
}

main().catch((err) => {
  console.error(`✗ audit hard-failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
