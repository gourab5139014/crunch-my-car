# MCP Cloud Connector Design

This document explores the architectural changes required to expose the "Crunch My Car" application as a remote Model Context Protocol (MCP) server. This allows AI agents (such as Claude) to act as a client and interact with users' vehicle data on their behalf.

## 1. MCP Server Requirements

Unlike a local desktop MCP server which communicates via standard input/output (stdio), a remote cloud connector requires a network transport.

*   **Transport Mechanism:** A remote MCP server uses Server-Sent Events (SSE) for server-to-client communication and standard HTTP POST requests for client-to-server messages.
*   **Hosting Target:** Given the application's existing architecture, **Supabase Edge Functions** (running on Deno) are the ideal hosting target. The official `@modelcontextprotocol/sdk` supports Deno and HTTP/SSE transports natively. This avoids spinning up a separate Node.js/Deno service and keeps the backend infrastructure unified.
*   **Endpoints:** The Edge Function will need to expose at least two endpoints:
    *   `GET /mcp/sse` — To establish the SSE connection.
    *   `POST /mcp/message` — To receive JSON-RPC messages from the client.

## 2. Authentication & Authorization

To allow an AI agent to securely access a user's data, the MCP server must identify the user and verify that the agent has permission.

*   **OAuth 2.0 / PATs:** The industry standard for MCP cloud connectors is OAuth 2.0. We will need to set up an OAuth flow so users can grant third-party agents access to their Crunch My Car account. Alternatively, for MVP, we could generate Personal Access Tokens (PATs) that users can provide to their AI agents.
*   **Proposed Scopes:**
    *   `vehicles:read` — View the user's fleet and vehicle details.
    *   `records:read` — View history (refuelings, services, expenses).
    *   `records:write` — Log new entries (refuelings, services, expenses).
    *   `analytics:read` — View derived metrics and statistics.

## 3. Tool Surface Design

The following operations should be exposed as MCP Tools in the server's manifest. AI agents will use these tools to fulfill user requests.

### Read-Only Tools (Safe for autonomous use)
*   **`list_vehicles`**: Retrieves a list of the user's cars (make, model, year, ID).
*   **`get_vehicle_stats`**: Fetches aggregated statistics (total spend, fuel efficiency, distance) by calling the `app.get_vehicle_stats` RPC.
*   **`get_vehicle_timeline`**: Retrieves a chronological log of events (fuel, service, expenses) for a given vehicle.
*   **`get_monthly_spending`**: Retrieves the spending breakdown for recent months.

### Write-Capable Tools (Action-oriented)
*   **`log_refueling`**: Logs a fuel stop.
    *   *Inputs*: `car_id`, `volume`, `total_cost`, `odometer`, `date` (optional, defaults to now).
*   **`log_service`**: Logs maintenance.
    *   *Inputs*: `car_id`, `description`, `total_cost`, `odometer`, `date`.
*   **`log_expense`**: Logs general expenses (insurance, wash).
    *   *Inputs*: `car_id`, `category`, `description`, `amount`, `date`.

*Risk Assessment:* Operations like deleting a vehicle or bulk-deleting logs are deemed too risky for autonomous agent execution and will not be exposed via MCP. The agent can only append data or read it.

## 4. API / Data Access Layer

The Edge Function hosting the MCP server must securely interact with the database.

*   **Direct Database Access via JS Client:** The MCP server should use the `@supabase/supabase-js` client.
*   **Leveraging RLS:** Instead of using the Supabase Service Role key (which bypasses all security), the MCP server should instantiate the Supabase client using the OAuth token or PAT provided by the agent. This ensures that the existing Row-Level Security (RLS) policies in the `app` schema are perfectly respected. The agent can only access data belonging to the authenticated user.
*   **Thin Layer:** The tools will sit as a thin translation layer: converting MCP JSON-RPC tool calls into standard Supabase JS client calls (`.from('refuelings').insert(...)` or `.rpc('get_vehicle_stats')`).

## 5. Schema & Capability Gaps

While the current schema supports the core application, AI agents thrive on rich, conversational metadata.

*   **Missing Fields in `app.refuelings`**:
    *   `notes` (text) — To capture unstructured agent input (e.g., "Car felt a bit sluggish").
    *   `station_name` (text) — Useful for context ("I fueled up at Shell").
    *   `fuel_grade` (text) — E.g., "Premium 98", "Regular 91".
*   **Derived Data**: Agents shouldn't have to calculate fuel efficiency themselves. We will expose the existing aggregated RPC functions (`app.get_vehicle_stats` and `app.get_fuel_efficiency_trend`) directly as tools, rather than just returning raw records.

---

## Follow-up Implementation Issues

1.  **[Schema]** Add `notes`, `station_name`, and `fuel_grade` columns to the `app.refuelings` table.
2.  **[Auth]** Implement a mechanism for Personal Access Tokens (PATs) or basic OAuth 2.0 to allow agents to authenticate as a user.
3.  **[Infrastructure]** Create a Supabase Edge Function (`mcp-server`) configured with the `@modelcontextprotocol/sdk` and SSE transport.
4.  **[Feature]** Implement read-only MCP tools (`list_vehicles`, `get_vehicle_stats`, `get_vehicle_timeline`).
5.  **[Feature]** Implement write-capable MCP tools (`log_refueling`, `log_service`, `log_expense`) ensuring proper user-scoped database access.
