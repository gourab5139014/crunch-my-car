# MCP Cloud Connector Design: Crunch My Car

This document explores the architectural requirements and design decisions for exposing the "Crunch My Car" application as a remote Model Context Protocol (MCP) server. This allows AI agents (e.g., Claude, or any MCP-compatible client) to interact with user vehicle data securely over the cloud.

## 1. MCP Server Requirements & Transport

### Transport Mechanisms
The MCP protocol supports both local (stdio) and remote transports. For a cloud-hosted connector, we need a remote transport. The two primary options are:
- **SSE (Server-Sent Events) over HTTP:** The client connects to an SSE endpoint to receive events from the server, and uses a separate HTTP POST endpoint to send messages to the server.
- **WebSockets:** Bidirectional communication over a single connection.

**Decision: SSE over HTTP Transport**
Given the current stack uses Supabase, which heavily leans on Serverless and Edge Functions (via Deno), WebSockets can be challenging due to long-lived connection limits and scaling in a serverless environment. An SSE-based transport with an HTTP POST message endpoint is much better suited for Supabase Edge Functions. It provides a standard, stateless way to handle incoming requests while still allowing the server to stream responses back to the client.

### Hosting Target
**Decision: Supabase Edge Functions**
The application is already heavily integrated with Supabase (Database, Auth). Deploying the MCP server as a Supabase Edge Function ensures:
- Direct, low-latency access to the Supabase database.
- Seamless integration with Supabase Auth (verifying JWTs).
- No need to provision and manage a separate standalone Node/Deno service.
- We can leverage the official `@modelcontextprotocol/sdk` for TypeScript/Deno.

## 2. Authentication & Authorisation

To allow third-party AI agents to access user data securely, we must implement an OAuth 2.0 flow. AI agents are clients that need scoped access.

### Integration with Supabase Auth
Supabase Auth currently handles first-party login. To act as an OAuth Authorization Server, we need to:
1. **Implement an OAuth Consent Screen:** A web view where the user authorizes the third-party AI agent.
2. **Issue Scoped Access Tokens:** We will need a way to issue custom JWTs or reference tokens with specific scopes that the AI agent can use.
   - *Note:* Supabase Auth does not natively act as a full OAuth 2.0 Provider (it is an OAuth *Client* for external providers like Google). We may need to build a lightweight OAuth 2.0 Authorization Server layer on top of our Supabase Edge Functions, or utilize a third-party service (like Auth0 or WorkOS) just for the OAuth Provider capability. Alternatively, we can use a simpler custom API Key approach for MVP, but a standard OAuth flow is required for broad MCP client compatibility. Let's aim for a custom Edge Function that implements the minimum required OAuth 2.0 Authorization Code flow, storing issued tokens/sessions in a new `app.api_keys` or `app.oauth_tokens` table.

### Proposed OAuth Scope Model
Scopes should be granular to allow users to grant read-only or read-write access.
- `vehicles:read` - Read vehicle details.
- `refuelings:read` - Read refueling history.
- `refuelings:write` - Log new refuelings.
- `services:read` - Read service/maintenance history.
- `services:write` - Log new services.
- `expenses:read` - Read expense history.
- `expenses:write` - Log new expenses.

## 3. Tool Surface Design

We will expose specific tools that agents can call.

### Proposed Tools

| Tool Name | Capability | Read/Write | Confirmation Required? |
| :--- | :--- | :---: | :---: |
| `list_vehicles` | Get a list of the user's vehicles (ID, name). | Read | No |
| `get_vehicle_history` | Retrieve recent logs (refuelings, services, expenses) for a given vehicle. | Read | No |
| `get_fuel_summary` | Get aggregated fuel statistics (total spent, average efficiency) over a time period. | Read | No |
| `log_refueling` | Record a new fuel stop (odometer, liters, cost, date). | Write | Yes (User should review before final commit) |
| `log_service` | Record maintenance or service details. | Write | Yes |
| `log_expense` | Record a general vehicle expense. | Write | Yes |

*Note on Confirmation:* Actions that mutate data or have financial implications should generally require user confirmation in the AI agent client before proceeding. MCP handles this via the client UI, but we should clearly document the side effects in the tool descriptions so the LLM knows to ask for confirmation if the client enforces it.

## 4. API / Data Access Layer

Currently, the frontend calls the Supabase JS client directly, and Row Level Security (RLS) protects the data.

### Interaction Model
- **Client (AI Agent) -> MCP Server (Edge Function):** The agent sends an HTTP POST request containing an MCP JSON-RPC message. The request includes the OAuth Access Token in the `Authorization: Bearer <token>` header.
- **MCP Server (Edge Function) -> Database:** The Edge Function validates the token.
  - *Option A (Direct RLS):* The Edge Function uses the token's `user_id` to initialize a Supabase client acting *as that user*. This elegantly reuses all existing RLS policies!
  - *Option B (Service Role + RPC):* The Edge Function uses the Service Role key to bypass RLS, but manually enforces scopes based on the token.

**Decision: Direct RLS via Supabase Client**
We will decode the OAuth token to extract the user's Supabase UUID. We then create a Supabase client scoped to that user. This ensures that the existing RLS policies in the `app` schema automatically apply to all MCP tool requests, maintaining a single source of truth for authorization. We will also need to verify the *scopes* on the token within the Edge Function before allowing specific tool executions (e.g., rejecting a `log_refueling` tool call if the `refuelings:write` scope is missing).

## 5. Schema & Capability Gaps

Are there missing fields that would enhance agent interactions?

- **Refuelings Table:**
  - `station_name` (Text): Useful for answering "Where did I last fill up?"
  - `fuel_grade` (Text): "Did I put Premium in the Civic?"
  - `notes` (Text): Free-form context that agents excel at capturing.
  - `is_full_tank` (Boolean): Important for accurate fuel efficiency calculations.
- **General Logs:**
  - Standardized `tags` array for flexible querying by agents.

### Data Aggregation
The `get_fuel_summary` tool should rely on PostgreSQL RPCs (like those added in Phase 4) to perform aggregations server-side, rather than the agent attempting to pull all raw records and calculate it.

## 6. Draft Tool Manifest

Here is a draft of the tools to be exposed via the MCP server:

```json
{
  "tools": [
    {
      "name": "list_vehicles",
      "description": "List all vehicles owned by the user, returning their IDs and names.",
      "inputSchema": {
        "type": "object",
        "properties": {}
      }
    },
    {
      "name": "log_refueling",
      "description": "Log a refueling event for a vehicle.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "car_id": { "type": "string", "description": "UUID of the vehicle" },
          "date": { "type": "string", "description": "Date of refueling (YYYY-MM-DD)" },
          "odometer": { "type": "number", "description": "Current odometer reading" },
          "liters": { "type": "number", "description": "Amount of fuel filled" },
          "total_cost": { "type": "number", "description": "Total cost of the refueling" },
          "notes": { "type": "string", "description": "Optional context or location" }
        },
        "required": ["car_id", "date", "odometer", "liters", "total_cost"]
      }
    },
    {
      "name": "get_fuel_summary",
      "description": "Get aggregated fuel consumption and cost metrics for a specific vehicle over a time period.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "car_id": { "type": "string", "description": "UUID of the vehicle" },
          "start_date": { "type": "string", "description": "Start date (YYYY-MM-DD)" },
          "end_date": { "type": "string", "description": "End date (YYYY-MM-DD)" }
        },
        "required": ["car_id"]
      }
    }
  ]
}
```

## 7. Concrete Follow-Up Implementation Issues

Based on this exploration, the following concrete issues should be created:

1. **[Backend] Expand Refueling Schema:** Add `station_name`, `fuel_grade`, `notes`, and `is_full_tank` to the `app.refuelings` table to better support agent-driven logging context.
2. **[Backend] Implement OAuth 2.0 Authorization Flow:** Create Supabase Edge Functions and necessary database tables (`oauth_clients`, `oauth_tokens`) to support the standard OAuth 2.0 Authorization Code flow for third-party access.
3. **[Frontend] Implement OAuth Consent Screen:** Build a UI where users can review requested scopes and authorize third-party AI agents.
4. **[Backend] Build MCP SSE Transport Layer:** Create a Supabase Edge Function to handle MCP SSE connections and incoming messages.
5. **[Backend] Implement MCP Tool Handlers:** Write the specific handler functions for the defined tools (`list_vehicles`, `log_refueling`, etc.), ensuring token scope validation and RLS enforcement.
