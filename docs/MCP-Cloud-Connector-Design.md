# MCP Cloud Connector Design: Crunch My Car

## 1. MCP Server Requirements
* **Transport:** Cloud-hosted MCP servers must use SSE (Server-Sent Events) or HTTP streaming transport over HTTP/HTTPS, unlike local servers which use `stdio` (standard input/output). The SSE transport allows multiple independent clients to connect over the network.
* **Hosting Options:** Since the stack uses Supabase, we can use **Supabase Edge Functions** (Deno) or host a standalone Node.js service (e.g., on Vercel or a persistent container). Edge Functions are ideal because they sit next to the database and use the same Deno ecosystem as standard MCP SDKs, though we need to verify SSE support (Deno edge functions support streaming responses).

## 2. Authentication & Authorisation
* **OAuth 2.0 Integration:** Cloud connectors require OAuth 2.0. To support this, Supabase Auth needs to be configured as an OAuth provider, or we must implement an OAuth wrapper over Supabase Auth so AI agents can request tokens.
* **Proposed Scopes:**
  * `vehicles:read`
  * `refuelings:read`, `refuelings:write`
  * `services:read`, `services:write`
  * `expenses:read`, `expenses:write`

## 3. Tool Surface Design
* **Proposed Tools:**
  * `list_vehicles` (Read-only): Retrieves a list of user's vehicles.
  * `log_refueling` (Write): Add a refueling entry (odometer, liters, cost).
  * `log_service` (Write): Add a service entry.
  * `log_expense` (Write): Add a general expense.
  * `get_vehicle_history` (Read-only): View timeline of a car.
  * `get_fuel_summary` (Read-only): View aggregate stats.
* **Safety Considerations:** Writes (logging data) are generally safe to expose as they just append records. Deletions should *not* be exposed to agents.

## 4. API / Data Access Layer
* **Architecture:** The MCP Server (Edge Function) will sit between the AI Agent and the Supabase Database.
* **Data Access:** The MCP Server will take the agent's OAuth token (which resolves to a Supabase User ID), initialize a Supabase client with that auth context, and perform operations. This means the existing Row Level Security (RLS) policies will seamlessly apply to agent-originated requests!

## 5. Schema & Capability Gaps
* **Metadata gaps:** The current schema for `refuelings` doesn't have fields for fuel grade, station name, or free-text notes, which might be useful if the agent extracts them from user speech.
* **Derived Data:** Exposing aggregate views (like the existing RPCs/views `vehicle_timeline_view`) is better than raw records so the agent doesn't have to do complex math.

## Conclusion & Next Steps
We will use Supabase Edge Functions with the `@modelcontextprotocol/sdk` to build the connector.

### Concrete Follow-up Implementation Issues:
1. Implement Supabase Edge Function with MCP SSE transport.
2. Implement OAuth 2.0 flow for third-party AI agents.
3. Write MCP tools for reading/writing vehicle data.
