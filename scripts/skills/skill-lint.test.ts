/**
 * Tier 1 — static skill lint (PR-blocking, no credentials).
 *
 * A skill is prose + embedded facts. This suite catches the cheapest-to-detect
 * drift without touching any external system: malformed frontmatter, broken
 * repo file references, dead relative links, and a missing/invalid facts.yaml.
 *
 * Runs under the same `npm test` (vitest) as component tests. Scans ALL skills
 * under .claude/skills, so it protects future skills too.
 */
import { describe, it, expect } from 'vitest'
import { readFile, glob, access } from 'node:fs/promises'
import { dirname, basename, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function collectSkillFiles(): Promise<string[]> {
  const files: string[] = []
  for await (const f of glob('.claude/skills/*/SKILL.md', { cwd: REPO_ROOT })) {
    files.push(f)
  }
  return files.sort()
}

async function exists(absPath: string): Promise<boolean> {
  try {
    await access(absPath)
    return true
  } catch {
    return false
  }
}

const skillFiles = await collectSkillFiles()

it('finds at least one skill to lint', () => {
  expect(skillFiles.length).toBeGreaterThan(0)
})

describe.each(skillFiles)('skill: %s', (relPath) => {
  const absPath = resolve(REPO_ROOT, relPath)
  const skillDir = dirname(absPath)
  const dirName = basename(skillDir)

  it('has valid frontmatter (name + description; name matches directory)', async () => {
    const raw = await readFile(absPath, 'utf8')
    const { data } = matter(raw)
    expect(typeof data.name, 'frontmatter `name` must be a string').toBe('string')
    expect(typeof data.description, 'frontmatter `description` must be a string').toBe('string')
    expect(data.description.length, '`description` should be non-trivial').toBeGreaterThan(20)
    expect(data.name, '`name` must match the skill directory name').toBe(dirName)
  })

  it('references only repo paths that exist on disk', async () => {
    const raw = await readFile(absPath, 'utf8')
    // Backtick-wrapped repo-relative paths, e.g. `src/components/Foo.tsx`.
    // Anchored to known top-level source dirs so we ignore SQL identifiers,
    // shell snippets, and prose. A trailing glob/word segment is tolerated.
    const re = /`((?:src|supabase|scripts|\.github|\.claude)\/[^`\s]+?)`/g
    const referenced = new Set<string>()
    for (const m of raw.matchAll(re)) {
      let p = m[1]
      if (p.includes('*')) continue // globs are patterns, not concrete files
      p = p.replace(/[.,);]+$/, '') // strip trailing punctuation
      referenced.add(p)
    }
    const missing: string[] = []
    for (const p of referenced) {
      if (!(await exists(resolve(REPO_ROOT, p)))) missing.push(p)
    }
    expect(missing, `SKILL.md references paths that do not exist: ${missing.join(', ')}`).toEqual([])
  })

  it('has no broken relative markdown links', async () => {
    const raw = await readFile(absPath, 'utf8')
    const re = /\[[^\]]+\]\((\.\.?\/[^)]+)\)/g
    const missing: string[] = []
    for (const m of raw.matchAll(re)) {
      const target = m[1].split('#')[0] // drop anchor
      if (!target) continue
      if (!(await exists(join(skillDir, target)))) missing.push(m[1])
    }
    expect(missing, `broken relative links: ${missing.join(', ')}`).toEqual([])
  })

  it('ships a parseable facts.yaml if one exists (and it stays in sync)', async () => {
    const factsPath = join(skillDir, 'facts.yaml')
    if (!(await exists(factsPath))) return // facts.yaml is optional per skill
    const facts = parseYaml(await readFile(factsPath, 'utf8')) as Record<string, unknown>
    expect(facts, 'facts.yaml must parse to an object').toBeTruthy()
    expect(facts.last_verified, 'facts.yaml must carry a last_verified date').toBeTruthy()

    // Structural sanity: the SKILL.md prose column table and facts.yaml should
    // describe the same number of refuelings columns (catches one drifting
    // without the other). Only enforced when both are present.
    const legacy = facts.legacy_schema as { tables?: Record<string, { columns?: unknown[] }> } | undefined
    const factCols = legacy?.tables?.refuelings?.columns
    if (Array.isArray(factCols)) {
      const raw = await readFile(absPath, 'utf8')
      // Count rows in the "### `legacy.refuelings` columns" markdown table.
      // The section runs to the next "## "/"### " heading; column rows are the
      // lines beginning with a backtick-wrapped cell (`| \`name\` | ... |`).
      const afterHeading = raw.split('### `legacy.refuelings` columns')[1] ?? ''
      const section = afterHeading.split(/\n#{2,3} /)[0] ?? afterHeading
      const rows = section
        .split('\n')
        .filter((l: string) => l.trim().startsWith('| `'))
      expect(
        rows.length,
        `facts.yaml lists ${factCols.length} refuelings columns but SKILL.md prose lists ${rows.length}`,
      ).toBe(factCols.length)
    }
  })
})
