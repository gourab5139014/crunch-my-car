# MCP Cloud Connector Design

This document outlines the architectural requirements and design for exposing the Crunch My Car application as a remote Model Context Protocol (MCP) server.

## 1. Overview
The MCP Cloud Connector allows users to interact with their vehicle data (cars, refuelings, services, and expenses) through AI agents (e.g., Claude, Cursor) using the Model Context Protocol.

## 2. Architecture & Transport

### Transport: Streamable HTTP
While MCP originally supported Server-Sent Events (SSE) for remote connections, the specification has moved towards **Streamable HTTP** (introduced in protocol version `2026-03-26`).
- **Benefits:** More robust, standard HTTP request/response flow for JSON-RPC 2.0 messages, better compatibility with edge environments.
- **Implementation:** Use `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport`.

### Hosting: Supabase Edge Functions
- **Target:** A new Supabase Edge Function (e.g., `supabase/functions/mcp/index.ts`).
- **Runtime:** Deno.
- **Why:** Native support for streaming, global low-latency deployment, and direct integration with Supabase Auth and Database.

## 3. Authentication & Authorization

### OAuth 2.1 Server
The connector will leverage Supabase Auth's built-in OAuth 2.1 Server functionality.
- **Flow:** Authorization Code Flow with PKCE.
- **Identity:** AI agents authenticate as the existing Supabase user.
- **Discovery:** Clients can use `.well-known/oauth-authorization-server` and `.well-known/openid-configuration`.

### Proposed OAuth Scopes
- `vehicles:read`: View car details (make, model, odometer).
- `vehicles:write`: Add or update car information.
- `logs:read`: View refueling, service, and expense history.
- `logs:write`: Create new refueling, service, or expense records.
- `analytics:read`: Access aggregated data (fuel efficiency, spending trends).

## 4. Tool Surface Design

| Tool Name | Scope | Description | Input Schema |
|-----------|-------|-------------|--------------|
| `list_vehicles` | `vehicles:read` | Lists all cars in the user's fleet. | `{}` |
| `get_vehicle_history` | `logs:read` | Fetches the unified timeline for a specific vehicle. | `{ "car_id": "UUID", "limit": 20 }` |
| `log_refueling` | `logs:write` | Records a new fuel fill-up. | `{ "car_id": "UUID", "date": "ISO8601", "odometer": integer, "liters": numeric, "total_cost": numeric }` |
| `log_service` | `logs:write` | Records a maintenance event. | `{ "car_id": "UUID", "date": "ISO8601", "odometer": integer, "description": string, "total_cost": numeric }` |
| `log_expense` | `logs:write` | Records a general vehicle expense. | `{ "car_id": "UUID", "date": "ISO8601", "amount": numeric, "category": string, "description": string }` |
| `get_vehicle_summary` | `analytics:read` | Returns high-level stats (fuel efficiency, total spend). | `{ "car_id": "UUID" }` |

## 5. Data Access Layer
- **RLS:** The Edge Function will use the user's OAuth access token (as a Bearer token) to initialize the Supabase client. This ensures all queries respect existing Row Level Security policies in the `app` schema.
- **RPCs:** Tools like `get_vehicle_summary` will directly call the existing Postgres functions (e.g., `app.get_vehicle_stats`) to ensure performance and consistency.

## 6. Implementation Roadmap (Follow-up Issues)

1. **Task 7.1: Enable OAuth 2.1 Server**
   - Update `supabase/config.toml` to enable `[auth.oauth_server]`.
   - Implement the consent UI in the React frontend (route: `/oauth/consent`).
2. **Task 7.2: Implement MCP Edge Function**
   - Create `supabase/functions/mcp/` using Deno and MCP SDK.
   - Implement `Streamable HTTP` transport handling.
3. **Task 7.3: Tool Implementation**
   - Map MCP tools to Supabase client queries and RPCs.
   - Ensure proper error handling and input validation.
4. **Task 7.4: Verification & Testing**
   - Test with `mcp-inspector` or a local MCP client.
   - Verify RLS enforcement via OAuth tokens.
5. **Task 7.5: CI/CD Integration**
   - Update GitHub Actions to deploy the new MCP edge function.
