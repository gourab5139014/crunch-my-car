# Project Overview: crunch-my-car

`crunch-my-car` is a Supabase-powered application. This project is currently in its initialization phase, with foundational agent skills and configurations in place to leverage the Supabase ecosystem.

## Tech Stack & Tools

- **Backend-as-a-Service:** [Supabase](https://supabase.com/)
  - **Project Reference:** `cofmlyvqhxjkmyzbtrsy`
  - **MCP Server:** Configured to interact with the Supabase project via `https://mcp.supabase.com/mcp?project_ref=cofmlyvqhxjkmyzbtrsy`.
- **Primary Language (Inferred):** Python (based on `.gitignore` templates).
- **Agent Enhancements:**
  - `supabase`: Specialized skill for Supabase products (Database, Auth, Edge Functions, etc.).
  - `supabase-postgres-best-practices`: Skill for optimized Postgres schema design and query writing.

## Directory Structure

- `.agents/skills/`: Contains installed agent skills.
- `.gemini/`: Project-specific agent configurations, including the Supabase MCP server settings.
- `skills-lock.json`: Dependency lock file for agent skills.
- `.gitignore`: Comprehensive Python-based ignore rules.

## Development Workflow

### Supabase Integration
This project is tightly integrated with Supabase. Use the following tools for development:
- **Supabase Skill:** Triggered for any task involving Supabase services.
- **Supabase MCP:** Provides direct access to project logs, advisors, and management APIs.

### Building and Running
*TODO: Document specific build and run commands once the application framework (e.g., FastAPI, Django, or a frontend library) is established.*

### Testing
*TODO: Document testing practices as the codebase grows.*

## Instructional Mandates

- **CRITICAL: No Legacy Schema Changes:** NEVER make any changes to the legacy schema. This is the most important rule in this repository and takes precedence over all other instructions.
- **Supabase-First:** For any database, authentication, or serverless function requirements, prioritize Supabase features.
- **SQL Standards:** All DDL and SQL operations must adhere to the guidance provided by the `supabase-postgres-best-practices` skill.
- **Agentic Workflow:** Leverage the installed skills in `.agents/skills/` to ensure consistency and security when interacting with the Supabase backend.
