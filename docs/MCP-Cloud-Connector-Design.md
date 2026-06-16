# MCP Cloud Connector Design: Crunch My Car

This document outlines the architectural requirements and design for exposing the Crunch My Car application as a remote Model Context Protocol (MCP) server. This enables AI agents (e.g., Claude) to interact with vehicle data on behalf of users.

## 1. MCP Server Requirements & Literature Survey

The Model Context Protocol (MCP) is an open standard that allows LLMs to interact with external data and tools. For a cloud-hosted "Cloud Connector," the following requirements apply:

- **Transport:** Must support **Streamable HTTP** (replaces the older HTTP+SSE). This allows for bidirectional communication and is suitable for stateless environments like Edge Functions.
- **Protocol Version:** Should implement the latest specification (currently `2025-11-25`).
- **Standardized Messaging:** Uses JSON-RPC 2.0 for all communications.
- **State Management:** Cloud connectors are typically "stateless" per request but maintain session state via the `Mcp-Session-Id` header.

**Best Practices:**
- Implement the `initialize` lifecycle correctly, including capability negotiation.
- Use structured logging (standard error in stdio, but for HTTP, integrated with cloud logging).
- Ensure high availability and low latency for agent responsiveness.

## 2. Transport and Hosting Decision

- **Transport:** **Streamable HTTP**.
  - *Reasoning:* It is the modern MCP standard for remote servers, offering better support for multiple connections and resumability compared to the legacy SSE transport.
- **Hosting Target:** **Supabase Edge Functions**.
  - *Reasoning:*
    - Low-latency execution at the edge.
    - Native integration with Supabase Auth and Database.
    - Direct access to the `app` schema using the service role or user JWT.
    - Simplified deployment via the existing Supabase CLI.

## 3. Authentication & Authorization

To allow third-party AI agents (or the user's primary assistant) to access data, the application will leverage the **Supabase OAuth 2.1 Server** (currently in Public Beta).

- **Flow:** AI agents will use the **Authorization Code Flow with PKCE** to obtain an access token.
- **Identity Provider:** Supabase Auth acts as the OIDC identity provider.
- **Token Usage:** The MCP server (Edge Function) will validate the incoming Bearer token (JWT) which carries the user's identity.
- **RLS Integration:** Requests made by the MCP server will respect the existing Row Level Security (RLS) policies on the `app` schema by using the user's delegated identity.

## 4. Proposed OAuth Scope Model

Access will be restricted using granular OAuth scopes:

| Scope | Description |
|---|---|
| `vehicles:read` | View the list of cars and their details. |
| `vehicles:write` | Add or modify car information. |
| `refuelings:read` | Read fuel logs and consumption data. |
| `refuelings:write` | Log new fuel fill-ups. |
| `services:read` | View maintenance and service history. |
| `services:write` | Log new service/maintenance events. |
| `expenses:read` | View general vehicle expenses. |
| `expenses:write` | Log new expenses. |
| `analytics:read` | Access aggregated data (cost per km, efficiency). |

## 5. Tool Surface Design (Draft Manifest)

The MCP server will expose the following tools:

### `list_vehicles`
- **Description:** Returns a list of all vehicles owned by the user.
- **Inputs:** None.

### `log_refueling`
- **Description:** Logs a new refueling event for a specific car.
- **Inputs:**
  - `car_id` (UUID)
  - `date` (ISO string)
  - `odometer` (Integer)
  - `liters` (Numeric)
  - `total_cost` (Numeric)
  - `notes` (Optional string)

### `get_vehicle_history`
- **Description:** Returns a unified timeline of refuelings, services, and expenses for a car.
- **Inputs:**
  - `car_id` (UUID)
  - `limit` (Optional Integer)

### `get_fuel_summary`
- **Description:** Returns aggregated fuel efficiency and cost metrics for a vehicle.
- **Inputs:**
  - `car_id` (UUID)

## 6. API / Data Access Layer

- **Existing RLS:** The current RLS policies in the `app` schema are sufficient as they isolate data by `user_id`. The Edge Function will act on behalf of the `user_id` extracted from the OAuth token.
- **Database Access:** The MCP server will use the `supabase-js` client within the Edge Function.
- **Thin RPC Layer:** Complex aggregations (like fuel efficiency) will continue to use the Postgres RPCs defined in `supabase/migrations/20260601000000_analytics_engine_rpcs.sql`.

## 7. Schema & Capability Gaps

- **Notes Field:** Most tables have limited `description` fields. Adding a dedicated `notes` field to `refuelings` would benefit agent interactions.
- **Fuel Grade/Station:** Currently missing from the schema; would add value for users asking about specific fuel types or locations.
- **Unit Preferences:** Ensure the MCP server respects the user's unit preferences (Metric vs. Imperial) stored in the `profiles` table.

## 8. Follow-up Implementation Issues

1. **Setup Supabase OAuth Server:** Configure the project as an OAuth provider and define scopes.
2. **Develop MCP Edge Function:** Create a new Deno-based Edge Function `functions/mcp-connector`.
3. **Implement MCP Protocol in Deno:** Port or use an existing MCP SDK for Deno to handle JSON-RPC over Streamable HTTP.
4. **Tool Implementation:** Map the MCP tool calls to Supabase client queries and RPCs.
5. **Testing & Verification:** Use the MCP Inspector or a custom client to verify tool execution and auth flow.
