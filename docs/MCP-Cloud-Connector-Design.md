# MCP Cloud Connector Design

This document explores the architectural changes needed to expose the "Crunch My Car" application as a remote Model Context Protocol (MCP) server. This will allow AI agents (like Claude) to interact with user vehicle data on their behalf.

## 1. MCP Server Requirements

### Transport Protocol
A cloud-hosted MCP server requires a different transport protocol than a local (stdio) server. Based on the [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), the server should use the **Streamable HTTP** transport.
*   **Mechanism:** The server uses HTTP POST and GET requests. The client sends JSON-RPC messages via POST. The server can optionally use Server-Sent Events (SSE) via GET to stream multiple messages back.
*   **Key Differences from stdio:** Unlike stdio, where the client spawns a local process and communicates via standard input/output, the HTTP transport is for remote servers. The server runs independently, handles multiple connections, and must handle authentication and authorization.

### Hosting Target
Given the current stack uses Supabase, there are a few options:
*   **Supabase Edge Functions:** Ideal for lightweight, serverless execution. They can run Deno, which is compatible with MCP SDKs. However, if long-lived SSE connections are required, Edge Functions might face execution time limits depending on the plan.
*   **Standalone Node/Deno Service:** A dedicated backend service (e.g., hosted on Render, Fly.io, or AWS ECS) would provide complete control over long-lived connections and scaling, but adds infrastructure complexity.
*   **Decision:** Start with **Supabase Edge Functions** to keep the infrastructure simple and consolidated. If Edge Function execution limits become an issue for SSE, fallback to a standard HTTP polling model if supported by MCP, or migrate to a standalone Deno/Node service.

## 2. Authentication & Authorisation

To allow third-party AI agents to access user data, we must implement an OAuth 2.0 flow.

### Supabase OAuth 2.1 Server
Supabase Auth can act as an [OAuth 2.1 identity provider](https://supabase.com/docs/guides/auth/oauth-server). This allows the application to authenticate AI agents through MCP.
*   **Mechanism:** The MCP client redirects the user to the Supabase authorization endpoint. The user authenticates and approves access. Supabase issues an authorization code, which the client exchanges for an access token (JWT).
*   **Integration:** These access tokens include `user_id` and `client_id` claims, which automatically work with the existing Row Level Security (RLS) policies.

### OAuth Scope Model
Scopes define the level of access the agent has. We need to define scopes that balance utility with security.
*   `vehicles:read`: View cars and their basic details.
*   `records:read`: View refuelings, services, and expenses history.
*   `records:write`: Log new refuelings, services, and expenses.
*   `analytics:read`: Access derived stats (e.g., fuel efficiency, spending trends).

*Recommendation:* Start with granular scopes so users can restrict agents to read-only access if they prefer.

## 3. Tool Surface Design

We need to define which operations are exposed as MCP tools.

### Proposed Tool Manifest

| Tool Name | Type | Description | Input Schema (Draft) |
| :--- | :--- | :--- | :--- |
| `list_vehicles` | Read | Get a list of the user's vehicles. | `{}` |
| `get_vehicle_history` | Read | Get timeline of fuel, service, and expense records for a vehicle. | `{ "car_id": "string", "limit": "number" }` |
| `get_vehicle_stats` | Read | Get aggregated stats (total spend, fuel efficiency) for a vehicle. | `{ "car_id": "string" }` |
| `log_refueling` | Write | Log a new fuel stop. | `{ "car_id": "string", "date": "string", "odometer": "number", "volume": "number", "total_cost": "number" }` |
| `log_service` | Write | Log a new service record. | `{ "car_id": "string", "date": "string", "odometer": "number", "description": "string", "total_cost": "number" }` |
| `log_expense` | Write | Log a general vehicle expense. | `{ "car_id": "string", "date": "string", "amount": "number", "category": "string", "description": "string" }` |

### Risk Assessment
*   **Read operations** (`list_vehicles`, `get_vehicle_history`, `get_vehicle_stats`) are low risk.
*   **Write operations** (`log_refueling`, etc.) are higher risk as they modify user data.
*   *Confirmation Strategy:* For initial implementation, write operations can be executed directly by the agent if the user granted the `records:write` scope. If the app needs more control, the tool could return a "draft" ID, and the user must confirm it in the main UI, but this breaks the seamless agent experience. Relying on OAuth scopes is the standard approach.

## 4. API / Data Access Layer

Currently, the frontend calls Supabase directly.

### Data Access for MCP
*   The MCP server will receive the user's Supabase JWT (obtained via the OAuth flow).
*   **Approach:** The MCP server (e.g., Supabase Edge Function) will instantiate a Supabase client using this JWT.
*   **RLS Policies:** Existing RLS policies are based on `auth.uid()`. Since the OAuth access token is a valid Supabase Auth JWT for that user, the existing RLS policies will automatically apply and restrict data access to only the user's own cars and records.
*   **REST/RPC vs Direct:** The MCP tools should call the existing Supabase REST APIs and RPC functions (like `app.get_vehicle_stats`) directly using the user-scoped client. No thin intermediate REST layer is needed.

## 5. Schema & Capability Gaps

Are there missing fields that would be valuable for agent interactions?

### Missing Fields
*   **Refuelings:**
    *   `fuel_grade` (e.g., Premium, Diesel, Regular).
    *   `station_name` or `location`.
    *   `notes` (free text).
    *   `price_per_unit` (currently we have `volume` and `total_cost`, but explicit price per unit might be helpful for agents parsing receipts).
*   **Services:**
    *   `provider_name` (e.g., "Bob's Auto Shop").
*   **Derived Data:**
    *   The `app.get_vehicle_stats` RPC already provides good aggregated data (cost, efficiency). Exposing this as a dedicated MCP tool (`get_vehicle_stats`) is better than having the agent calculate it from raw records.

## 6. Follow-up Implementation Issues

1.  **[Infrastructure] Set up Supabase OAuth 2.1 Server:** Enable and configure the OAuth server in the Supabase project to allow dynamic client registration for MCP.
2.  **[Schema] Expand Refueling and Service Schemas:** Add `fuel_grade`, `station_name`, and `notes` to `app.refuelings`, and `provider_name` to `app.services`.
3.  **[Backend] Implement MCP Server Edge Function:** Create a Supabase Edge Function running an MCP SDK with the Streamable HTTP transport.
4.  **[Backend] Implement MCP Tools (Read):** Add handlers for `list_vehicles`, `get_vehicle_history`, and `get_vehicle_stats`.
5.  **[Backend] Implement MCP Tools (Write):** Add handlers for `log_refueling`, `log_service`, and `log_expense`.
