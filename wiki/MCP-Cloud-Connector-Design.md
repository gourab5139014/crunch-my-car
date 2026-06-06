# MCP Cloud Connector Design

This document outlines the architectural requirements for exposing Crunch My Car as a remote Model Context Protocol (MCP) server. By implementing an MCP cloud connector, users can interact with their vehicle data seamlessly through AI agents (e.g., Claude) without opening the app manually.

## 1. MCP Server Requirements

### Remote Server Exposure
A remote (cloud-hosted) MCP server uses the **Streamable HTTP** transport (which replaces the older HTTP+SSE transport from earlier protocol versions).
- It must provide a single HTTP endpoint path (e.g., `https://api.crunchmycar.com/mcp`) that supports both `POST` and `GET` methods.
- The client sends JSON-RPC messages to the MCP endpoint via HTTP `POST`.
- The server responds via `application/json` for a single JSON response, or `text/event-stream` to initiate an SSE stream.
- An optional `GET` request from the client can open an SSE stream directly for server-to-client notifications.
- The server exposes a tool manifest via `tools/list` request, and clients execute tools using `tools/call`.

### Differences from Local stdio
- **Local stdio** uses standard input/output streams for direct process communication (like Claude Desktop launching a local script). It relies on local environment variables or host configuration for authentication and is generally limited to one client per process.
- **Remote Streamable HTTP** operates as an independent service handling multiple client connections over a network. It must validate the `Origin` header to prevent DNS rebinding attacks and properly implement session management, multiple concurrent connections, optional resumability (via `Last-Event-ID`), and standardized authorization (OAuth 2.0).

### Hosting Options Compatible with Current Stack
Crunch My Car currently relies on a React frontend and Supabase (PostgreSQL, Auth, RLS). Compatible hosting options for the MCP server:
1. **Supabase Edge Functions (Deno):** Ideal because it runs closely with the database and integrates seamlessly with Supabase Auth. Deno supports SSE natively, making it a strong candidate for a serverless MCP transport layer.
2. **Standalone Node.js/Deno Service:** Hosted on a platform like Fly.io, Railway, or Vercel. This provides more flexibility for complex event loops, background jobs, and full WebSocket/SSE support, but requires managing separate deployment infrastructure.

**Decision Recommendation:** Start with **Supabase Edge Functions** to minimize operational overhead and keep the architecture unified.

## 2. Authentication & Authorisation

### OAuth 2.0 for Third-Party Agents
MCP cloud connectors require OAuth 2.0 so users can grant AI agents scoped access to their data without sharing their primary credentials.
- **Current Setup:** Supabase provides native authentication (email, OAuth providers for *logging in*), but it acts as a Resource Server / Auth Server for first-party clients.
- **What needs to be added:** Supabase does not natively act as an OAuth 2.0 authorization server that issues access tokens to *third-party* clients (like Claude). We need to implement an OAuth 2.0 Authorization flow (specifically, Authorization Code Grant with PKCE).
  - This requires creating custom tables in Supabase (e.g., `oauth_clients`, `oauth_codes`, `oauth_tokens`).
  - Edge Functions can handle the `/authorize` (presents consent screen to user) and `/token` (exchanges code for access token) endpoints.
  - The MCP server will validate the Bearer token (JWT) passed in the `Authorization` header.

### Proposed OAuth Scopes
Agents should operate on the principle of least privilege.
- `vehicles:read` - View list of cars and their details.
- `refuelings:read` - View refueling history.
- `refuelings:write` - Add new refueling logs.
- `services:read` - View service history.
- `services:write` - Log vehicle services.
- `expenses:read` - View general expenses.
- `expenses:write` - Log general expenses.
- `analytics:read` - View vehicle stats and fuel summaries.

## 3. Tool Surface Design

Operations exposed as MCP tools should be granular, self-describing, and safe.

### Candidate Tools & Permissions
- `list_vehicles` (Read-only): Returns the user's vehicles with basic info (make, model, ID, preferred units).
- `get_vehicle_history` (Read-only): Retrieves recent entries from the timeline (fuel, service, expenses).
- `get_fuel_summary` (Read-only): Retrieves `get_vehicle_stats` and `get_monthly_spending`.
- `log_refueling` (Write-capable): Accepts `car_id`, `date`, `odometer`, `volume`, `total_cost`, etc.
- `log_service` (Write-capable): Accepts `car_id`, `date`, `odometer`, `total_cost`, `description`.
- `log_expense` (Write-capable): Accepts `car_id`, `date`, `amount`, `category`, `description`.

### Safety & Confirmation
Read-only operations are safe. Write operations (`log_refueling`, `log_service`, `log_expense`) modify user data.
- Are they too risky? Typically, logging a refueling or expense is low-risk because it can be deleted later by the user if incorrect.
- **Agent Confirmation:** We can require the AI agent to ask the user for confirmation *before* calling the write tool, but we can't strictly enforce this at the protocol layer.
- **MCP Elicitation:** The MCP protocol provides an `elicitation` capability where the *server* can ask the client's AI application to prompt the user for input or confirmation. If high confidence is needed, the server can use this primitive before committing the write. Alternatively, soft-deletes or an "unverified" flag could be introduced.

**Draft Tool Manifest (Examples):**
- `log_refueling`:
  - `car_id` (string, required)
  - `odometer` (number, required)
  - `volume` (number, required)
  - `total_cost` (number, required)
  - `notes` (string, optional)

## 4. API / Data Access Layer

Currently, the frontend calls Supabase directly using the JS client, heavily relying on Row-Level Security (RLS).

### Supabase RLS and Agent Requests
- **Current RLS:** Policies are based on `auth.uid()`, which is derived from the Supabase Auth JWT.
- **Agent Requests:** If we issue custom OAuth JWTs, `auth.uid()` might not automatically resolve unless we map the OAuth token's `sub` to the Supabase user ID.
- **Solution 1 (Direct RLS):** If we generate a standard Supabase JWT for the agent (with a custom claim like `role: 'agent'` and `scopes`), the Supabase client in the Edge Function can instantiate with this token, and existing RLS policies will work automatically.
- **Solution 2 (Service Role):** The MCP server uses the `service_role` key to bypass RLS, but manually enforces scopes and user isolation based on the verified OAuth token.

**Recommendation:** Use the **Service Role** approach in the MCP Edge Function, but explicitly `set_config('request.jwt.claim.sub', user_id)` before executing queries so that Postgres RLS handles the isolation, ensuring we don't accidentally leak data. Additionally, we must check OAuth scopes *before* performing the action in the function logic.

## 5. Schema & Capability Gaps

### Missing Metadata for Agent Interactions
Currently, `app.refuelings` records `odometer`, `volume`, and `total_cost`. For rich AI interactions (e.g., parsing a receipt), additional fields would be valuable:
- `fuel_grade` (e.g., Premium, Regular, Diesel)
- `station_name` / `location` (where they fueled up)
- `notes` (free-text for agent interpretation)
- `is_full_tank` (boolean, helps AI calculate efficiency more accurately if partial fills happen)

### Derived vs. Raw Data
AI agents are capable of computing metrics from raw data, but it is token-intensive and error-prone.
- The connector **should** expose derived data. The existing PostgreSQL functions (`get_vehicle_stats`, `get_fuel_efficiency_trend`) are perfect for this. Exposing `get_vehicle_stats` as a tool provides the agent immediate context on cost-per-km and average fuel efficiency without forcing it to query and sum up 100 raw records.

## Summary of Output
- **Transport:** Streamable HTTP.
- **Hosting Target:** Supabase Edge Functions.
- **Auth:** Custom OAuth 2.0 provider implemented via Edge Functions.
- **Data Access:** Edge Function using Supabase client with explicit user impersonation to leverage RLS, guarded by OAuth scope checks.
- **Next Steps:** See `implementation-issues.md` for a concrete breakdown of work.
