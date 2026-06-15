# MCP Cloud Connector Design

## 1. MCP Server Requirements

**Remote Server Capabilities**
A remote (cloud-hosted) Model Context Protocol (MCP) server must expose an endpoint for handling client connections over the network. Unlike local stdio servers that use sub-process standard input/output for communication, a remote server uses HTTP.
According to the latest MCP specification, a cloud connector should use the **Streamable HTTP** transport.
This requires exposing a single HTTP endpoint path (e.g. `https://api.crunchmycar.com/mcp`) that supports both `POST` and `GET` requests.
- `POST` requests are used to send JSON-RPC messages (requests, notifications, responses) from the client to the server.
- `GET` requests are used to initiate Server-Sent Events (SSE) streams, allowing the server to stream messages to the client.

**Differences from Local stdio**
- **Transport**: Network (HTTP/SSE) vs. Process I/O (stdin/stdout).
- **Concurrency**: Cloud servers must handle multiple concurrent client connections, whereas stdio typically handles a single 1:1 client-server relationship.
- **Session Management**: Cloud servers require session tracking (e.g., via `Mcp-Session-Id` headers) and resumability (via SSE event IDs) to handle intermittent network disconnections.
- **Security**: Cloud servers require authentication and authorization (e.g., OAuth 2.0), origin validation, and secure transport (TLS/HTTPS).

**Hosting Target**
The current stack utilizes Supabase Edge Functions (Deno). This is an excellent fit for the MCP server:
- Supabase Edge Functions support standard web streams, which is required for Server-Sent Events (SSE).
- Edge Functions are natively integrated with Supabase Auth, making session management and user authorization straightforward.
- A standalone Node/Deno service is also an option, but keeping it within Supabase Edge Functions reduces infrastructure overhead and aligns with the existing architecture.

**Decision**: Use **Streamable HTTP** transport hosted on **Supabase Edge Functions**.


## 2. Authentication & Authorization

**OAuth 2.0 Integration**
For a user to grant an AI agent (e.g., Claude) access to their vehicle data, the app must act as an OAuth 2.0 authorization server. The AI agent acts as the client requesting delegated access.
Supabase Auth currently handles user authentication. To support third-party agents:
1. We need to implement an OAuth 2.0 flow (Authorization Code Grant). Since Supabase Auth does not natively act as a full OAuth 2.0 provider for third-party apps out-of-the-box, we will need to build an OAuth issuance layer (likely using Edge Functions) to issue access tokens mapped to specific scopes, or leverage a custom identity provider configuration if possible.
2. The agent will redirect the user to a consent screen on our app.
3. Upon approval, the agent receives an access token.
4. The agent passes this token (e.g., via Bearer token in the `Authorization` header) to the MCP endpoint.
5. The Edge Function verifies the token, resolves the user ID, and validates scopes before processing MCP requests.

**Proposed Scope Model**
We should define granular scopes to follow the principle of least privilege:
- `vehicles:read` - Allows reading the list of cars and basic details.
- `vehicles:write` - Allows creating, updating, or deleting cars (High risk).
- `history:read` - Allows reading refuelings, services, and expenses.
- `refuelings:write` - Allows logging new refueling entries.
- `services:write` - Allows logging new service entries.
- `expenses:write` - Allows logging general expenses.


## 3. Tool Surface Design

Operations exposed as MCP tools must be carefully considered based on utility and risk.

| Tool Name | Type | Description |
|---|---|---|
| `list_vehicles` | Read-only | Returns the user's registered vehicles and their IDs. |
| `get_vehicle_history` | Read-only | Returns combined history (refuelings, services, expenses) for a specific vehicle. |
| `get_fuel_summary` | Read-only | Returns aggregated stats (e.g., fuel efficiency, total spent) for a specific vehicle. |
| `log_refueling` | Write | Logs a fuel stop (requires `car_id`, `date`, `odometer`, `liters`, `total_cost`). Ties into quick-entry goals. |
| `log_service` | Write | Logs maintenance (requires `car_id`, `date`, `odometer`, `description`, `total_cost`). |
| `log_expense` | Write | Logs an expense (requires `car_id`, `date`, `amount`, `description`, `category`). |

**Risk Assessment**
Read-only tools are safe. Write operations (`log_refueling`, etc.) are generally safe as they add temporal log entries and don't destructively modify core configuration.
Destructive operations (e.g., `delete_vehicle`) should **not** be exposed to AI agents without explicit user confirmation, or they should simply be omitted from the tool manifest entirely.


## 4. API / Data Access Layer

**Current State**
The frontend calls the Supabase REST/GraphQL APIs directly via the JS client, authenticated by user JWTs. Row-Level Security (RLS) ensures users only access their own data.

**MCP Server Access Layer**
The MCP server (running in an Edge Function) will receive requests authenticated by the OAuth access token.
1. The Edge Function must exchange or validate the agent's OAuth token to identify the acting `user_id`.
2. To strictly enforce the existing RLS policies without modification, the Edge Function should instantiate a Supabase client using the **user's context** (e.g., by creating a restricted JWT for the session or passing the validated `user_id` to a customized client).
3. Using the Service Role key + custom SQL wrapper is possible but bypasses RLS by default, increasing the risk of cross-tenant data leaks. It is safer to sit behind a thin RPC layer or issue queries with a user-scoped JWT.

**Decision**: The MCP tools should use a Supabase client initialized with a restricted user JWT (derived from the OAuth token verification) to leverage the existing database RLS policies. This ensures the agent-originated requests are subject to the exact same database-level security as frontend requests.


## 5. Schema & Capability Gaps

Reviewing the baseline schema (`app.refuelings`, `app.services`, `app.expenses`), a few gaps exist for rich agent interaction:
- **Location Data**: AI agents often extract locations (e.g., "Logged fuel at Shell on Main St"). The current schema lacks `station_name` or `location` fields in `app.refuelings` and `app.services`.
- **Fuel Grade**: Useful metadata for vehicles requiring premium vs. regular (e.g., `fuel_grade` in `app.refuelings`).
- **Notes/Comments**: While `services` has `description`, `refuelings` currently lacks a `notes` field for arbitrary agent or user commentary.

**Derived Data**
Should the connector expose derived data (e.g., cost per km)?
Yes, exposing derived data via read-only tools like `get_fuel_summary` reduces the token context window needed by the LLM. Instead of sending raw records and asking the LLM to calculate efficiency, providing pre-calculated metrics is more efficient and accurate.


## Concrete Follow-Up Implementation Issues

1. **[Infrastructure] Implement MCP Streamable HTTP Endpoint in Supabase Edge Functions**
   - Setup a basic Deno edge function handling POST/GET and SSE streams adhering to the MCP spec.
2. **[Auth] Design and Implement OAuth 2.0 Authorization Layer**
   - Create the necessary tables and endpoints (authorization screen, token issuance) to support third-party agents.
3. **[Database] Schema Enhancements for AI Metadata**
   - Add `location`, `fuel_grade`, and `notes` columns to the `app.refuelings` table.
4. **[MCP] Implement Read-Only Tools**
   - Develop the logic and schemas for `list_vehicles`, `get_vehicle_history`, and `get_fuel_summary`.
5. **[MCP] Implement Write Tools**
   - Develop the logic and schemas for `log_refueling`, `log_service`, and `log_expense`.
