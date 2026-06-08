# MCP Implementation Follow-up Issues

Based on the [MCP Cloud Connector Design](./MCP-Cloud-Connector-Design.md), the following tasks need to be completed to expose Crunch My Car as a remote MCP server.

## Issue 1: Implement OAuth 2.0 Authorization Server for Agent Delegation
**Description:** Implement an OAuth 2.0 authorization flow to allow third-party AI agents to request scoped access to user data.
**Requirements:**
- Create an endpoint (e.g. Supabase Edge Function) for the authorization screen where the user can grant or deny access to the agent.
- Implement token generation (Access Tokens and Refresh Tokens) linked to the `auth.users` ID.
- Store granted scopes (e.g., `vehicles:read`, `refuelings:write`) securely.
- Ensure the tokens can be validated and revoked.

## Issue 2: Create Streamable HTTP MCP Endpoints
**Description:** Build the core Model Context Protocol transport endpoints using Deno (Supabase Edge Functions).
**Requirements:**
- Implement the June 2025 MCP specification for Streamable HTTP transport.
- Create an MCP endpoint that supports both HTTP GET (for initiating SSE streams) and HTTP POST (for sending JSON-RPC messages).
- Integrate OAuth 2.0 token validation so that all requests made through the MCP endpoint are authenticated and mapped to the correct user.
- Enforce the negotiated OAuth scopes.
- Handle session management via `Mcp-Session-Id`.

## Issue 3: Schema Enhancements for Agent Context
**Description:** Add fields to existing tables to better capture unstructured data and context provided through LLM conversations.
**Requirements:**
- Add a `notes` column (TEXT) to `app.refuelings`, `app.services`, and `app.expenses`.
- Add a `location` or `station_name` column (TEXT) to `app.refuelings`.
- Add a `fuel_type` column (TEXT) to `app.refuelings`.
- Create a migration file and update necessary views or types.

## Issue 4: Implement MCP Read-Only Tools
**Description:** Build the initial set of read-only tools to allow agents to query user data.
**Requirements:**
- Implement `list_vehicles` to retrieve a list of the user's vehicles.
- Implement `get_vehicle_history` leveraging the `app.vehicle_timeline` view.
- Implement `get_vehicle_stats` leveraging the `app.get_vehicle_stats` RPC.
- Ensure the Supabase client used inside the Edge Function properly passes the user's JWT to leverage existing Row Level Security (RLS) policies.

## Issue 5: Implement MCP Write Tools
**Description:** Build write-capable tools allowing agents to log new records.
**Requirements:**
- Implement `log_refueling`.
- Implement `log_service`.
- Implement `log_expense`.
- Ensure strict input validation within the tools.
- (Optional but recommended) Include safeguards to prevent duplicate or conflicting entries within a short timeframe.
