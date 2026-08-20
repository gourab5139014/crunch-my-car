# MCP Cloud Connector - Follow-up Implementation Issues

Based on the [MCP Cloud Connector Design](./wiki/MCP-Cloud-Connector-Design.md), the following implementation issues should be created to build out the feature.

---

### Issue 1: Implement OAuth 2.0 Authorization Server in Supabase Edge Functions
**Description:**
To allow third-party AI agents to connect via MCP, we need to act as an OAuth 2.0 authorization server.
**Tasks:**
- Create Supabase migrations for OAuth tables: `oauth_clients`, `oauth_codes`, `oauth_tokens`.
- Implement a `GET /authorize` Edge Function that serves a consent screen (React/HTML) asking the user to approve the requested scopes for the `client_id`.
- Implement a `POST /authorize` Edge Function to process the user's consent and generate an authorization code.
- Implement a `POST /token` Edge Function (supporting PKCE) that exchanges the authorization code for a short-lived JWT access token and a refresh token.
- Add scopes: `vehicles:read`, `refuelings:read`, `refuelings:write`, `services:read`, `services:write`, `expenses:read`, `expenses:write`, `analytics:read`.

---

### Issue 2: Create Streamable HTTP MCP Server Edge Function
**Description:**
Implement the core MCP protocol transport layer.
**Tasks:**
- Create a new Supabase Edge Function `POST /mcp` (or similar).
- Implement OAuth Bearer token validation and extract the user's `sub` (ID) and granted scopes.
- Implement the MCP Streamable HTTP transport (JSON-RPC over HTTP, potentially handling SSE if required by the SDK/design).
- Integrate the official `@modelcontextprotocol/sdk` (if Deno compatible) or implement a lightweight custom JSON-RPC handler that conforms to the specification.

---

### Issue 3: Implement MCP Tool Handlers & Data Access
**Description:**
Wire the MCP tools to the Supabase PostgreSQL database using secure data access patterns.
**Tasks:**
- Implement the `tools/list` handler to return the manifest of available tools (e.g., `list_vehicles`, `log_refueling`, `get_vehicle_history`, `get_fuel_summary`).
- Implement the `tools/call` handler.
- Create a data access wrapper using the `@supabase/supabase-js` client initialized with the `service_role` key.
- Before executing any query for a tool, execute a `set_config('request.jwt.claim.sub', user_id, true)` call in the same transaction/session so that PostgreSQL RLS policies apply correctly.
- Add scope validation before tool execution (e.g., `log_refueling` requires `refuelings:write` scope).

---

### Issue 4: Extend Database Schema for Richer AI Interactions
**Description:**
Add additional metadata fields to support AI agent use cases (like receipt scanning).
**Tasks:**
- Create a migration to add `fuel_grade` (TEXT), `station_name` (TEXT), `notes` (TEXT), and `is_full_tank` (BOOLEAN DEFAULT true) to the `app.refuelings` table.
- Create a migration to add `notes` (TEXT) to `app.services` and `app.expenses`.
- Update the frontend UI to display and optionally edit these new fields.
- Update the backend RLS and RPCs if necessary to select/insert these new fields.
