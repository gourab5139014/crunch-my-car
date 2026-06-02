# MCP Cloud Connector Design for Crunch My Car

This document explores the architectural requirements and design decisions necessary to expose Crunch My Car as a remote Model Context Protocol (MCP) server. This allows AI agents (e.g., Claude) to act as clients, seamlessly retrieving data and performing actions on behalf of the user.

## 1. MCP Server Requirements

### Standard stdio vs. Remote Server
A standard MCP server typically uses standard input/output (`stdio`) to communicate with a local process (e.g., a local Claude Desktop app). However, to act as a cloud connector accessible to cloud-based agents and users on different devices, the server must be remote.

### Transport Options
The Model Context Protocol supports remote execution through two main web-compatible transports:
- **Server-Sent Events (SSE)**: Best for servers that need to push updates or handle streaming responses, using HTTP for client-to-server requests and SSE for server-to-client messages.
- **HTTP/WebSockets**: Alternatively, some setups use raw WebSockets for bi-directional communication.

**Decision**: **Server-Sent Events (SSE) with HTTP POST**. SSE is the standard recommendation in the MCP specification for remote HTTP servers because it maps well to standard web infrastructure (load balancers, firewalls) and is straightforward to implement in serverless environments.

### Hosting Target
The current stack is built on Supabase (PostgreSQL, Auth, Edge Functions) and a React/Vite frontend.
**Decision**: **Supabase Edge Functions (Deno)**.
- It naturally integrates with Supabase Auth and the database (RLS).
- It handles HTTP POST and SSE streams well.
- It reduces the need for external hosting infrastructure like a separate Node.js service.

## 2. Authentication & Authorisation

To allow third-party AI agents to access a user's Crunch My Car data, the connector must establish a trust relationship. The AI agent acts on behalf of the user.

### OAuth 2.0 Integration
MCP cloud connectors require OAuth 2.0 so users can grant agents scoped access to their data.
- **Requirement**: Supabase Auth currently handles first-party user login. We need to implement an OAuth 2.0 Authorization Server flow (Authorization Code Grant).
- **Implementation**: Since Supabase doesn't natively act as a full OAuth 2.0 provider for *third-party apps* out of the box, we may need to build a custom OAuth consent screen and token issuance flow within our Edge Functions, storing third-party app credentials and user grants in the database.

### Proposed OAuth Scope Model
Scopes should follow the principle of least privilege, separating read and write access, and segregating domains.
- `vehicles:read` - Read vehicle details and list vehicles.
- `vehicles:write` - Create or update vehicle details.
- `refuelings:read` - Read refueling logs.
- `refuelings:write` - Log new refuelings.
- `services:read` - Read service history.
- `services:write` - Log new services.
- `expenses:read` - Read general expenses.
- `expenses:write` - Log general expenses.
- `metrics:read` - Read aggregated metrics and fuel summaries.

## 3. Tool Surface Design

Tools are the functions that the MCP server exposes to the AI agent.

### Draft Tool Manifest
1. **`list_vehicles`** (Read-only)
   - *Description*: Retrieves a list of all vehicles owned by the user.
   - *Input*: `None` (user inferred from token).
2. **`log_refueling`** (Write)
   - *Description*: Logs a new refueling event for a specific vehicle. Ties into quick entry goals.
   - *Input*: `vehicle_id`, `odometer` (number), `fuel_amount` (number), `cost` (number), `notes` (string, optional).
3. **`get_vehicle_history`** (Read-only)
   - *Description*: Retrieves the combined timeline of refuelings, services, and expenses for a vehicle.
   - *Input*: `vehicle_id`, `limit` (number, default 10), `type` (enum: 'all', 'refueling', 'service', 'expense').
4. **`log_service`** (Write)
   - *Description*: Logs a maintenance or service event.
   - *Input*: `vehicle_id`, `odometer` (number), `service_type` (string), `cost` (number), `notes` (string).
5. **`log_expense`** (Write)
   - *Description*: Logs a general car expense (e.g., insurance, washing).
   - *Input*: `vehicle_id`, `category` (string), `cost` (number), `date` (string).
6. **`get_fuel_summary`** (Read-only)
   - *Description*: Gets aggregated fuel efficiency and cost metrics.
   - *Input*: `vehicle_id`, `timeframe` (enum: 'month', 'year', 'all').

### Safety Considerations
- **Read tools** are generally safe and can be executed without explicit user confirmation by the agent.
- **Write tools** (e.g., `log_refueling`, `log_service`) alter the user's data. Agents (like Claude) typically prompt the user for confirmation before executing a tool that performs a state-changing action. Our server should ensure strict validation of inputs. If we want additional safety, we could implement a "draft" state for logs that requires explicit approval in the app, but for a frictionless experience, direct writes with agent-side confirmation are standard.

## 4. API / Data Access Layer

Currently, the frontend queries Supabase directly, relying on Row Level Security (RLS) to ensure users only access their own data.

### Supabase Integration
When an agent calls an MCP tool via the Edge Function:
1. The Edge Function receives the request with the OAuth Access Token.
2. The Edge Function validates the token and identifies the user.
3. The Edge Function instantiates a Supabase client authenticated *as that specific user* (using the user's JWT).
4. The tool executes the database query.

**Decision**: **Direct Supabase calls with user JWT**.
By using the user's JWT within the Edge Function, we reuse the existing RLS policies. The agent-originated requests are treated the same as frontend requests at the database level. No REST/RPC abstraction layer is strictly necessary if the Edge Function handles the tool-to-query mapping. We only need to ensure the Edge Function respects the granted OAuth scopes before executing the query.

## 5. Schema & Capability Gaps

Reviewing the current state, a few enhancements would make agent interactions richer:

### Missing Schema Fields
- **Location/Station Name**: For `refuelings`, capturing "Where did you refuel?" is common.
- **Fuel Grade**: "Premium vs. Regular" is useful context.
- **Service Center**: Where was the service performed?
- **Receipt Image URL**: If agents process photos, linking the raw receipt image is valuable.

### Derived Data
- The `get_fuel_summary` tool relies on derived data (e.g., cost per km, L/100km or MPG). The backend already has analytics RPCs (`calculate_fuel_efficiency`). The MCP server should expose these directly rather than forcing the agent to compute them from raw records.

## Summary of Decisions & Outputs

- **Transport**: Server-Sent Events (SSE) + HTTP POST.
- **Hosting**: Supabase Edge Functions.
- **Auth**: Custom OAuth 2.0 flow built on top of Supabase Auth.
- **Data Access**: Edge Functions map tool calls to direct Supabase queries using user-specific JWTs to leverage existing RLS.

## Concrete Follow-up Implementation Issues

1. **Issue: Add missing fields to schema**
   - Add `station_name`, `fuel_grade` to `refuelings`.
   - Add `provider_name` to `services`.
2. **Issue: Implement OAuth 2.0 Provider Flow**
   - Create tables for `oauth_clients`, `oauth_authorization_codes`, and `oauth_access_tokens`.
   - Build frontend consent screen (`/oauth/authorize`).
   - Build Edge Function for token exchange (`/oauth/token`).
3. **Issue: Create MCP Server Edge Function**
   - Implement the MCP protocol (SSE transport) in a Supabase Edge Function.
   - Setup routing for standard MCP endpoints (`/mcp`, `/mcp/message`).
4. **Issue: Implement Read-Only MCP Tools**
   - Implement `list_vehicles`, `get_vehicle_history`, and `get_fuel_summary` inside the MCP Edge Function, hooked up to Supabase.
5. **Issue: Implement Write-Capable MCP Tools**
   - Implement `log_refueling`, `log_service`, and `log_expense` with input validation.