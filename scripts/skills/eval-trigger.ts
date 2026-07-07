/**
 * Tier 3 — trigger/routing eval.
 *
 * Non-deterministic: asks a classifier whether the skill's `description` alone
 * should cause it to fire on each labeled prompt, and scores accuracy against
 * evals/legacy-refuel/triggers.jsonl. A pass is a threshold, not a proof.
 *
 * Run: ANTHROPIC_API_KEY=… npx tsx scripts/skills/eval-trigger.ts
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { ask, requireApiKey, extractJson } from './lib/anthropic.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = resolve(HERE, '../../.claude/skills/legacy-refuel-photo-entry/SKILL.md')
const CASES = resolve(HERE, '../../evals/legacy-refuel/triggers.jsonl')
const THRESHOLD = 0.9
const MODEL = 'claude-haiku-4-5-20251001'

type Case = { prompt: string; shouldTrigger: boolean }

async function main() {
  const apiKey = requireApiKey()
  const { data } = matter(await readFile(SKILL, 'utf8'))
  const description = String(data.description)

  const cases: Case[] = (await readFile(CASES, 'utf8'))
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

  const system =
    'You are a router deciding whether a single Claude Code skill should activate for a user prompt, ' +
    'given ONLY the skill\'s description. Respond with strict JSON: {"trigger": true|false}.'

  let correct = 0
  const failures: string[] = []
  for (const c of cases) {
    const out = await ask({
      apiKey,
      model: MODEL,
      system,
      prompt: `Skill description:\n"""${description}"""\n\nUser prompt:\n"""${c.prompt}"""\n\nShould this skill activate? Reply JSON only.`,
      maxTokens: 64,
    })
    const { trigger } = extractJson<{ trigger: boolean }>(out)
    if (trigger === c.shouldTrigger) correct++
    else failures.push(`  ✗ "${c.prompt}" → predicted ${trigger}, expected ${c.shouldTrigger}`)
  }

  const accuracy = correct / cases.length
  console.log(`Trigger eval: ${correct}/${cases.length} correct (accuracy ${(accuracy * 100).toFixed(0)}%, threshold ${THRESHOLD * 100}%)`)
  if (failures.length) console.log(failures.join('\n'))
  console.log('Note: sampled + non-deterministic — a pass is a threshold, not a proof.')

  if (accuracy < THRESHOLD) process.exit(1)
}

main().catch((err) => {
  console.error(`✗ trigger eval hard-failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
