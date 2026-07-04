---
name: legacy-refuel-photo-entry
description: "Use when inserting a refueling record into the LEGACY Supabase project (the previous version of crunch-my-car) from photos of an odometer and/or fuel-pump receipt. Also the reference for which Supabase project ref maps to which environment (dev / staging / legacy) and how to connect to each. Triggers: 'add refueling to legacy', 'log a fill-up in the old app/project', 'insert into legacy schema', 'which project is staging/prod/legacy', or pasting photos of an odometer + pump receipt to record fuel."
metadata:
  author: gourab.mitra
  version: "1.0.0"
---

# Legacy Refueling Photo Entry

Insert a single refueling record into the **legacy** Supabase project from an odometer photo + fuel-pump receipt photo. This project is the *previous version* of crunch-my-car; its data lives in a schema literally named `legacy`, and it stores **imperial** units.

## 1. Environment → project map (READ THIS FIRST)

| Environment | Project ref | Data API URL | App schema | How to reach it |
|---|---|---|---|---|
| Development | local Docker | `http://127.0.0.1:54321` | `app` | `supabase start`, `.env.development` |
| Staging (current app) | `yiejtkppiwhzedyfeyuv` | `https://yiejtkppiwhzedyfeyuv.supabase.co` | `app` | MCP server `supabase` in `.mcp.json`; `.env.staging` |
| **Legacy (previous app)** | `cofmlyvqhxjkmyzbtrsy` | `https://cofmlyvqhxjkmyzbtrsy.supabase.co` | **`legacy`** (see §2) | MCP server `supabase-legacy` (see §3); anon key in `.env.production` |

**Gotchas / corrections to repo docs:**
- `CLAUDE.md` labels `cofmlyvqhxjkmyzbtrsy` as **Production** and `.env.production` points at it. That is **stale/wrong** — `cofmlyvqhxjkmyzbtrsy` is the **legacy** project, not current-app production.
- The current app's real production project ref is **unverified / TBD** — do not assume it's `cofmlyvqhxjkmyzbtrsy`. Confirm before writing anything "to prod".
- The default MCP `supabase` server (from `.mcp.json`) is bound to **staging** only — it cannot query the legacy project. You must add a second MCP server (§3).

## 2. Legacy project schema layout

Exposed (Data-API) schemas on the legacy project: `public, graphql_public, legacy, dev, app`.

The real historical data is in the **`legacy`** schema (lowercase — `Legacy` is rejected with `PGRST106 Invalid schema`). Tables in `legacy`:

| `legacy` table | Purpose | Note |
|---|---|---|
| `refuelings` | fuel fill-ups — **insert target** | |
| `vehicles`   | the user's cars | legacy uses `vehicles`, **not** `cars` |
| `services`   | maintenance | |
| `expenses`   | general expenses | |

All tables are RLS-enabled, so the anon key returns `[]` (no rows) and can't reveal columns. Use service-role via MCP (§3) to introspect and insert.

### `legacy.refuelings` columns (verified)

Units are **imperial** — store receipt/odometer values as-is; do **NOT** convert to metric (the current `app` schema stores km/litres, but legacy does not).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | default `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `date` | date | **NOT NULL** — the fill date (from receipt) |
| `odometer` | integer | **NOT NULL** — **miles** |
| `volume_gal` | numeric | **gallons** (from receipt) |
| `price_per_gal` | numeric | price per gallon (from receipt) |
| `total_cost` | numeric | total sale (from receipt) |
| `fuel_type` | text | default `'Gasoline'` |
| `full_tank` | boolean | default `true` |
| `distance_mi` | numeric | miles since previous fill = `odometer − previous fill's odometer` |
| `notes` | text | free text; convention: station name, e.g. `Costco El Camino #475` |
| `user_id` | uuid | **NOT NULL**, default `auth.uid()` — but under the MCP service role `auth.uid()` is NULL, so **set it explicitly** |
| `vehicle_id` | uuid | FK to `legacy.vehicles.id` |

### Known identifiers (this user's data)

- Vehicle: **Primary Lexus / Lexus ES 350 (2010)** → `vehicle_id = e86fb69c-a00a-4480-bed1-aa218ca348d7`
- Legacy `user_id = 5423b575-98f5-4522-acf4-4f3ff4f12f26` (⚠ distinct from the *staging* user id `3e174459-…` — same person, different project, different auth.users row)

## 3. Connecting to the legacy project via MCP

The staging `supabase` MCP server can't reach it. Add a dedicated one (project scope so it lives in `.mcp.json`):

```bash
claude mcp add --scope project --transport http supabase-legacy \
  "https://mcp.supabase.com/mcp?project_ref=cofmlyvqhxjkmyzbtrsy"
```

Then **reconnect**: run `/mcp` (or restart Claude Code) and **approve/trust `supabase-legacy`** when prompted — project-scoped MCP servers require explicit approval and are NOT live in the session where they were added. The server then exposes an OAuth flow: call `mcp__supabase-legacy__authenticate`, give the user the returned URL to approve (needs `database:write`), and the SQL tools activate automatically. After that, `mcp__supabase-legacy__execute_sql` runs with service-role (bypasses RLS).

**Pause behavior:** free-tier legacy projects auto-pause. A paused project returns `503 PGRST002 "Could not query the database for the schema cache. Retrying."` on the Data API. Wake it by hitting any endpoint / unpausing in the dashboard, then retry — a `200`/`404`/`406` (instead of `503`) means it's awake.

## 4. Introspection / verification queries

```sql
-- confirm columns (if schema may have changed)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'legacy' and table_name = 'refuelings'
order by ordinal_position;

-- vehicles (pick vehicle_id + confirm user_id)
select id, name, make, model, year, user_id from legacy.vehicles;

-- recent fills — get the previous odometer for distance_mi, and avoid dupes
select date, odometer, volume_gal, total_cost, notes
from legacy.refuelings order by date desc limit 5;
```

## 5. Anon-key probing (no MCP, read-only, RLS-limited)

Quick "does the table/schema exist" check without MCP. Target a non-public schema via `Accept-Profile` (must be an exposed schema):

```bash
KEY="<anon key from .env.production>"
BASE="https://cofmlyvqhxjkmyzbtrsy.supabase.co/rest/v1"
curl -s "$BASE/refuelings?limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Accept-Profile: legacy"
```
- GET uses `Accept-Profile: <schema>`; POST/insert uses `Content-Profile: <schema>`.
- Root OpenAPI (`/rest/v1/`) needs a **secret** key (anon → `401 Secret API key required`), so probe by table name or use MCP.
- RLS means anon reads return `[]`; to see/insert real rows you need service-role (MCP) or an authenticated user JWT.

## 6. Photo → insert workflow

1. **Connect** to `supabase-legacy` MCP (§3). **Verify** columns/identifiers (§4) if anything might have changed.
2. **User provides photos** — odometer close-up and/or pump receipt (pasted into chat). HEIC files: convert first, e.g. `sips -s format jpeg IN.HEIC --out OUT.jpg`, then read.
3. **Extract** with vision (Claude reads the images directly; no edge function needed):
   - `odometer` — read the **ODO** value in **miles**
   - `volume_gal`, `price_per_gal`, `total_cost` — from the receipt
   - `date` — from the receipt (else ask / default today)
   - `notes` — station name from the receipt
4. **Derive**: `distance_mi = odometer − (previous fill's odometer)`; `full_tank = true` unless told otherwise; `fuel_type = 'Gasoline'` for regular gas.
5. **Sanity-check**: new `odometer` > previous; `volume_gal × price_per_gal ≈ total_cost`. Confirm the extracted + derived values with the user.
6. **Insert** one row and read it back (verified template):
   ```sql
   INSERT INTO legacy.refuelings
     (date, odometer, volume_gal, price_per_gal, total_cost,
      fuel_type, full_tank, distance_mi, notes, vehicle_id, user_id)
   VALUES
     ('2026-06-27', 222809, 12.323, 5.099, 62.83,
      'Gasoline', true, 230, 'Costco El Camino #475',
      'e86fb69c-a00a-4480-bed1-aa218ca348d7',
      '5423b575-98f5-4522-acf4-4f3ff4f12f26')
   RETURNING *;
   ```

## Prior art in this repo (current-app equivalent)

The current app already does photo-scan → refueling insert; reuse its logic as a reference (note it targets the current `app` schema and stores **metric**, unlike legacy):
- `src/components/PhotoDropZone.tsx` — drag/drop, HEIC→JPEG, downscale, calls `scan-refuel`.
- `supabase/functions/scan-refuel/index.ts` — Claude Haiku vision; returns `{odometer, volume, total_cost, confidence}` normalized to metric.
- `src/components/LogActivityModal.tsx` — maps extracted values into the form and inserts into `app.refuelings` (staging).

## Safety rules

- Never write to a project until you've confirmed which env it is (§1) — the repo docs mislabel the legacy project as "Production".
- Always confirm extracted + derived values with the user before inserting.
- Set `user_id` explicitly (service-role `auth.uid()` is NULL).
- This skill writes only to the `legacy` schema of the legacy project — never modify the current app's `app` schema from here.
