# Project Overview: crunch-my-car

`crunch-my-car` is a Supabase-powered application. This project is currently in its initialization phase, with foundational agent skills and configurations in place to leverage the Supabase ecosystem.

## Tech Stack & Tools

- **Backend-as-a-Service:** [Supabase](https://supabase.com/)
  - **Environments:**
    - **Production:** Ref `cofmlyvqhxjkmyzbtrsy` (MCP: `supabase_production`)
    - **Staging:** Ref `yiejtkppiwhzedyfeyuv` (MCP: `supabase_staging`)
    - **Development:** Local Docker stack via CLI (`supabase start`)
- **Primary Language:** React (TypeScript) with Vite.
- **Agent Enhancements:**
  - `supabase`: Specialized skill for Supabase products (Database, Auth, Edge Functions, etc.).
  - `supabase-postgres-best-practices`: Skill for optimized Postgres schema design and query writing.

## Directory Structure

- `.agents/skills/`: Contains installed agent skills.
- `.gemini/`: Project-specific agent configurations, including the Supabase MCP server settings.
- `skills-lock.json`: Dependency lock file for agent skills.
- `.gitignore`: Comprehensive Python-based ignore rules.

## Development Workflow

### Multi-Environment Architecture
The project uses a three-tier environment strategy to ensure safety and isolation. All application data lives in the **`app`** schema (not `public`).

#### 1. Development (Local)
- **Tooling:** Run `supabase start` to spin up the local Docker stack.
- **Frontend:** The Vite dev server uses `.env.development` to connect to `127.0.0.1:54321`.
- **Changes:** Make schema changes locally, then run `supabase db diff` to generate migration files.

#### 2. Staging (Remote)
- **Target:** Supabase project `yiejtkppiwhzedyfeyuv`.
- **Trigger:** Any push to the **`develop`** (or currently `init`) branch.
- **Automation:** GitHub Actions automatically runs `supabase db push` to the staging project.
- **Purpose:** Final verification and QA before production.

#### 3. Production (Remote)
- **Target:** Supabase project `cofmlyvqhxjkmyzbtrsy`.
- **Trigger:** Merging code into the **`main`** branch.
- **Automation:** GitHub Actions automatically runs `supabase db push` to the production project.

### Building and Running
1.  **Install Deps:** `npm install`
2.  **Start Local Backend:** `supabase start`
3.  **Run Frontend:** `npm run dev` (Connects to Local)
4.  **Build for Prod:** `npm run build` (Connects to Production)

### Testing
*TODO: Document testing practices as the codebase grows.*

## Instructional Mandates

- **CRITICAL: No Legacy Schema Changes:** NEVER make any changes to the legacy schema. This is the most important rule in this repository and takes precedence over all other instructions.
- **Supabase-First:** For any database, authentication, or serverless function requirements, prioritize Supabase features.
- **SQL Standards:** All DDL and SQL operations must adhere to the guidance provided by the `supabase-postgres-best-practices` skill.
- **Agentic Workflow:** Leverage the installed skills in `.agents/skills/` to ensure consistency and security when interacting with the Supabase backend.
