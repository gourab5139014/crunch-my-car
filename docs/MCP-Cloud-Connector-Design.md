# MCP Cloud Connector Design: Crunch My Car

This document explores the architectural changes required to expose the "Crunch My Car" application as a remote Model Context Protocol (MCP) server. This will allow users to interact with their vehicle data via AI agents (e.g., Claude) using a cloud connector.

## 1. MCP Server Requirements

A remote (cloud-hosted) MCP server needs to expose the standard MCP JSON-RPC message formats over an HTTP transport layer. Unlike local `stdio` MCP servers which communicate over standard input/output, a remote server communicates over the network.

**Transport Decision: Streamable HTTP**
The best choice for transport is **Streamable HTTP** (formerly HTTP+SSE). The MCP specification details that Streamable HTTP servers handle HTTP POST for client messages and can use Server-Sent Events (SSE) via HTTP GET to stream server messages to the client. This allows the AI agent to send JSON-RPC messages and receive streamed responses (useful for streaming progress, tool execution results, or server-initiated requests).

**Hosting Target: Supabase Edge Functions**
The application is currently built heavily around Supabase. Supabase Edge Functions (Deno-based) are an excellent hosting target. They support HTTP POST and streaming responses, run close to the database, and naturally integrate with Supabase Auth and the Supabase JavaScript client.

## 2. Authentication & Authorisation

To allow third-party agents to interact with a user's data, the application needs to act as an OAuth 2.0 provider. The user must be able to grant scoped access to the agent without sharing their primary password.

**Supabase Auth Integration**
Supabase Auth recently added support for an OAuth 2.0 server (can be enabled in `config.toml` via `[auth.oauth_server]`). By enabling this feature, the application can issue OAuth tokens to third-party clients (the AI agents). The AI agents will then attach these tokens to their HTTP requests to the Edge Function.

**Proposed OAuth Scope Model**
We should implement granular scopes to follow the principle of least privilege:
- `vehicles:read` - Read-only access to the list of vehicles and vehicle details.
- `records:read` - Read-only access to refuelings, services, and expenses.
- `records:write` - Ability to create or update refueling, service, and expense logs.
- `analytics:read` - Read-only access to aggregate statistics and derived data (e.g., cost per km).

## 3. Tool Surface Design

Operations exposed to the MCP server should be carefully curated. We will expose read-only queries and safe write operations (creates). Destructive operations (deletions) should generally NOT be exposed to AI agents without explicit user intervention, so we will omit them from the initial tool manifest.

**Draft Tool Manifest**

* **Read-Only Tools:**
  * `list_vehicles`: Lists all vehicles owned by the user (ID, name).
  * `get_vehicle_history`: Retrieves the timeline of refuelings, services, and expenses for a specific car. Input: `{ "car_id": "uuid", "limit": number }`
  * `get_fuel_summary`: Retrieves fuel consumption and cost statistics. Input: `{ "car_ids": ["uuid"] }`
  * `get_fleet_stats`: Retrieves total aggregated statistics for the fleet.

* **Write-Capable Tools:**
  * `log_refueling`: Logs a new fuel stop. Input: `{ "car_id": "uuid", "date": "YYYY-MM-DD", "odometer": number, "liters": number, "total_cost": number }`
  * `log_service`: Logs a service event. Input: `{ "car_id": "uuid", "date": "YYYY-MM-DD", "odometer": number, "description": "string", "total_cost": number }`
  * `log_expense`: Logs a generic vehicle expense. Input: `{ "car_id": "uuid", "date": "YYYY-MM-DD", "amount": number, "description": "string", "category": "string" }`

**Safety & Confirmation**
Operations are restricted to user-scoped data. Write-capable tools will insert new records but will not modify or delete existing ones. AI clients can summarize changes before applying them, providing a natural confirmation layer before invoking the tools.

## 4. API / Data Access Layer

**Execution Flow:**
1. The AI agent calls an MCP tool via Streamable HTTP to the Supabase Edge Function.
2. The Edge Function extracts the OAuth bearer token from the request.
3. The Edge Function initializes a Supabase client using this user-scoped token.
4. The tool logic interacts with the database using this client.

**Supabase RLS Policies**
Since the Supabase client is initialized with the user's OAuth token, all existing Row-Level Security (RLS) policies on the `app` schema (`app.cars`, `app.refuelings`, etc.) will automatically apply. There is no need for a complex RPC layer; the Edge Function can act as a thin wrapper that translates MCP JSON-RPC tool calls into Supabase client operations (`supabase.from('...').select()` or `.insert()`). The RLS policies inherently protect against cross-user data access.

## 5. Schema & Capability Gaps

While the current schema (`app.refuelings`, etc.) supports the core functionality, AI agents often deal with rich, unstructured, or varied context that might be valuable to store.

**Proposed Schema Additions**
- **Refuelings Table:**
  - `fuel_grade` (TEXT): The type/grade of fuel (e.g., Premium, Regular, Diesel).
  - `station_name` (TEXT): The name of the gas station.
  - `notes` (TEXT): Free-form notes (agents are great at extracting these).
- **Services Table:**
  - `service_provider` (TEXT): Name of the mechanic or shop.
- **Analytics & Aggregates:**
  - Existing RPCs (`get_vehicle_stats`, `get_fleet_stats`) expose useful derived data. These should be exposed directly as tools rather than having the agent recalculate them from raw records.

---

## Concrete Follow-Up Implementation Issues

Based on this design, the following issues should be created to track implementation:

1. **Enable OAuth Server in Supabase:**
   - Update `supabase/config.toml` to enable `[auth.oauth_server]` and configure dynamic client registration and consent paths.
   - Build a consent UI page in the React frontend.

2. **Schema Enhancements for Rich Logging:**
   - Create a database migration to add `fuel_grade`, `station_name`, and `notes` to `app.refuelings`, and `service_provider` to `app.services`.

3. **Develop the MCP Edge Function:**
   - Create a new Supabase Edge Function (`mcp-server`).
   - Implement the Streamable HTTP transport handling (handling POST requests and SSE GET requests).
   - Implement the tool registry and routing logic.

4. **Implement Read-Only MCP Tools:**
   - Implement `list_vehicles`, `get_vehicle_history`, `get_fuel_summary`, and `get_fleet_stats` in the Edge Function using the user-scoped Supabase client.

5. **Implement Write-Capable MCP Tools:**
   - Implement `log_refueling`, `log_service`, and `log_expense` in the Edge Function.
