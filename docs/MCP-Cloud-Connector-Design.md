# MCP Cloud Connector Design

## 1. MCP Server Requirements
To act as a "cloud connector" that allows an AI agent to interact with the vehicle data over the internet, we cannot use the standard `stdio` transport, which is designed for local, sub-process communication.

Instead, we must use the **Streamable HTTP transport** (or the older HTTP+SSE transport) as defined by the Model Context Protocol specification.
- **Transport**: The server must expose an HTTP endpoint that accepts `POST` requests for incoming JSON-RPC messages and can return `Content-Type: text/event-stream` (Server-Sent Events) to stream server responses or async events back to the client.
- **Hosting Target**: Since the application is already built around Supabase, a natural choice is **Supabase Edge Functions** (Deno). Supabase Edge Functions support streaming responses, making them technically capable of handling SSE. Alternatively, a standalone Node.js or Deno service (deployed to Vercel, Render, or a similar platform) can be used to handle the persistent HTTP connections required by MCP.

## 2. Authentication & Authorisation
Because this is a cloud connector accessed by third-party agents (e.g., Claude), users must securely grant access to their data without sharing their primary credentials.

- **OAuth 2.0 Integration**: Supabase has an OAuth Server feature (which can be enabled via `[auth.oauth_server]` in `config.toml`). This allows the Crunch My Car app to issue scoped access tokens to third-party AI agents.
- **Proposed OAuth Scope Model**:
  To adhere to the principle of least privilege, we should define granular scopes:
  - `vehicles:read` – View vehicles.
  - `refuelings:read` – Read refueling history and summaries.
  - `refuelings:write` – Log new refueling events.
  - `services:read` / `services:write` – View/log maintenance records.
  - `expenses:read` / `expenses:write` – View/log additional expenses.
  - `stats:read` – Access aggregated analytics/stats via RPC.

## 3. Tool Surface Design
The core functionality of Crunch My Car will be exposed as tools. AI agents execute these tools on behalf of the user.

**Proposed Read-Only Tools (Low Risk):**
- `list_vehicles`: Retrieves the user's vehicles (IDs, names, basic metadata).
- `get_vehicle_history`: Fetches recent refuelings, services, and expenses.
- `get_vehicle_stats`: Calls the existing `get_vehicle_stats` RPC to provide high-level metrics (total spend, fuel efficiency).
- `get_monthly_spending`: Retrieves monthly spending trends.

**Proposed Write Tools (Moderate/High Risk):**
- `log_refueling`: Inputs: `car_id`, `date`, `odometer`, `volume`, `total_cost`.
- `log_service`: Inputs: `car_id`, `date`, `odometer`, `description`, `total_cost`.
- `log_expense`: Inputs: `car_id`, `date`, `amount`, `description`, `category`.

*Safety Considerations*: Modifying existing data or deleting resources (e.g., deleting a car) poses a significant risk. We should initially restrict agents to append-only operations (logging new records). Destructive operations should either be completely excluded from the tool manifest or require an explicit user confirmation flow (such as an out-of-band UI confirmation link) before the action is finalized on the server.

## 4. API / Data Access Layer
Currently, the React frontend interacts directly with Supabase via the JS client, protected by Row-Level Security (RLS).

- **Direct vs. Indirect Access**: The MCP tools should **not** use the Supabase service role key to bypass RLS. Instead, the MCP server should instantiate the Supabase client using the OAuth access token granted by the user.
- **RLS Compatibility**: Because the OAuth token maps to the user's identity, the existing RLS policies on the `app.cars`, `app.refuelings`, `app.services`, and `app.expenses` tables will automatically apply. This ensures that the agent can only access and modify data belonging to the authorizing user, without requiring any changes to the database security model. The MCP server simply acts as a thin JSON-RPC to Supabase REST translation layer.

## 5. Schema & Capability Gaps
To make agent interactions richer and more natural, the current database schema can be improved:

**Missing Fields for Natural Language Context:**
- `refuelings`: Users often say, "I filled up at Shell" or "Premium gas." The schema currently only tracks `volume` (liters) and `total_cost`. We should consider adding `station_name`, `fuel_grade`, and a generic `notes` text column.
- `services`: Missing a `location`/`mechanic` field.

**Derived / Aggregated Data:**
The database already has excellent composite indexes and RPCs for analytics (e.g., `app.get_vehicle_stats`, `app.get_fuel_efficiency_trend`, `app.get_monthly_spending`).
- The MCP connector **should expose these derived views directly as read-only tools**. Agents are better at summarizing pre-calculated trends than trying to fetch all raw records and calculate fuel efficiency formulas themselves.

## Follow-up Implementation Issues
1. **[Backend] Enable and configure Supabase OAuth Server:** Create a spike to test issuing an OAuth token and using it to query the database via RLS.
2. **[Database] Schema updates for rich context:** Add `station_name`, `fuel_grade`, and `notes` columns to the `app.refuelings` table.
3. **[Server] Scaffold the MCP server:** Create a new directory (e.g., `mcp-server/`) and initialize an HTTP-based MCP server using the official `@modelcontextprotocol/sdk`.
4. **[Server] Implement Read Tools:** Expose `list_vehicles` and wrap the `get_vehicle_stats` RPC.
5. **[Server] Implement Write Tools:** Expose `log_refueling` with proper schema validation.
