# MCP Cloud Connector Design

## 1. MCP Server Requirements
### Transport Mechanism
The Model Context Protocol (MCP) specifies two standard transports: `stdio` and `Streamable HTTP` (previously HTTP+SSE). For a cloud-hosted connector designed to integrate with remote AI agents, **Streamable HTTP** is the required transport.

Unlike a local `stdio` server where the AI agent spawns the MCP server as a subprocess, a remote MCP server acts as an independent process that handles multiple client connections over HTTP.
- **Client to Server:** Messages are sent using HTTP POST to a single MCP endpoint.
- **Server to Client:** Responses and notifications can be streamed using Server-Sent Events (SSE) initiated via HTTP GET or as part of the POST response.

### Hosting Target
Given the current application stack (React, Vite, Supabase), the most compatible hosting option for the MCP Cloud Connector is **Supabase Edge Functions** or a standalone **Deno/Node.js** service.
- **Supabase Edge Functions** (Deno) offer the most direct integration, inheriting the auth context and reducing infrastructure overhead. However, maintaining long-lived SSE connections within Edge Functions can sometimes run into execution time limits.
- If Edge Functions prove too restrictive for persistent SSE connections, a standalone **Node/Deno service** running on a platform like Fly.io or Render is the recommended alternative, interacting with the Supabase database via the Supabase JS client.

**Decision:** We will initially target **Supabase Edge Functions** with the Streamable HTTP transport, falling back to a standalone Deno service if timeout limits hinder SSE stream stability.

## 2. Authentication & Authorisation
### OAuth 2.1 & Dynamic Client Registration
MCP cloud connectors require robust authorisation, typically implementing the OAuth 2.1 authorization framework. Because AI agents (MCP clients) need to interact with user data on their behalf, we must support:
- **Authorization Code Flow:** AI agents must guide users through an authorization flow to obtain an access token.
- **Dynamic Client Registration (RFC7591):** AI agents might not be pre-registered, so the connector should support dynamic registration to issue client IDs.

### Supabase Auth Extension
Currently, Supabase Auth handles first-party user authentication. To act as an OAuth 2.1 Authorization Server, we need to extend this setup:
- A custom authorization endpoint (e.g., via an Edge Function) that validates user identity using existing Supabase sessions and asks for consent to grant scopes to the requesting AI agent.
- Secure token issuance and validation, ensuring tokens are bound to their intended audience (the MCP server).

### Proposed OAuth Scopes
To enforce the principle of least privilege, we propose the following scopes:
- `vehicles:read`: Access to list vehicles and view their basic metadata.
- `vehicles:write`: Add, update, or remove vehicles.
- `refuelings:read`: View the history of refueling logs and calculated fuel efficiency.
- `refuelings:write`: Log new refueling events.
- `services:read`: View service history.
- `services:write`: Log new maintenance/service events.
- `expenses:read`: View other vehicular expenses.
- `expenses:write`: Log new expenses.
- `analytics:read`: Access aggregated data (e.g., monthly spending, overall fuel efficiency).

## 3. Tool Surface Design
The core capability of an MCP server is exposing tools. The following tools will be implemented, mapped to the proposed scopes:

### Read-Only Tools
- `list_vehicles`
  - **Description:** Returns a list of the user's vehicles with IDs, names, and basic stats.
  - **Scope:** `vehicles:read`
- `get_vehicle_history`
  - **Description:** Fetches a consolidated timeline of refuelings, services, and expenses for a given vehicle.
  - **Scope:** `refuelings:read`, `services:read`, `expenses:read`
- `get_fuel_summary`
  - **Description:** Retrieves aggregated fuel efficiency and spending trends.
  - **Scope:** `analytics:read`

### Write-Capable Tools
- `log_refueling`
  - **Description:** Records a fuel stop. Requires vehicle ID, date, odometer, volume, and total cost.
  - **Scope:** `refuelings:write`
- `log_service`
  - **Description:** Logs a maintenance event. Requires vehicle ID, date, odometer, description, and total cost.
  - **Scope:** `services:write`
- `log_expense`
  - **Description:** Logs a general expense. Requires vehicle ID, date, category, amount, and description.
  - **Scope:** `expenses:write`

**Risk Mitigation:** Destructive operations (like deleting a vehicle) are deliberately excluded from the initial tool manifest. Agents should primarily facilitate data entry and retrieval. Any potentially destructive action would require an explicit out-of-band confirmation mechanism.

## 4. API / Data Access Layer
### Thin REST/RPC Layer vs Direct Access
Currently, the frontend interacts directly with Supabase via the JS client, heavily relying on Row-Level Security (RLS) policies. For the MCP Cloud Connector, the recommended architecture is a **thin REST/RPC layer** (the MCP server itself) that handles incoming MCP tool calls and translates them into Supabase queries.

### RLS Policies and Agent Requests
The existing RLS policies restrict data access based on `auth.uid()`. When an MCP tool is invoked, the request will be accompanied by an OAuth access token representing the user.
1. The MCP server validates the OAuth access token.
2. It exchanges or maps the token to a valid Supabase Auth session for that user.
3. It performs the database operations using a Supabase client initialized with this user session.
This ensures that all existing RLS policies naturally apply to agent-originated requests without requiring complex extensions to the database schema.

## 5. Schema & Capability Gaps
While the current schema (`app.refuelings`, `app.services`, `app.expenses`) covers the basics, enriching the data model will improve AI interactions.

### Suggested Enhancements:
- **Refuelings Table:**
  - `station_name`: To capture where the user fueled up.
  - `fuel_grade`: To differentiate between Regular, Premium, Diesel, etc.
  - `notes`: A free-text field for extra context.
  - `is_full_tank`: Boolean flag. Accurate fuel efficiency calculations require knowing if the tank was filled to the brim.
- **Derived Data:**
  - The current RPC `app.get_vehicle_stats` provides `fuel_efficiency` and `total_distance`. The connector should expose these derived metrics directly so AI agents don't have to calculate them manually.

---

## Follow-Up Implementation Issues

1. **[Infrastructure] Implement MCP Streamable HTTP Transport Server**
   - Create a basic Supabase Edge Function or Deno service that implements the MCP Streamable HTTP lifecycle (POST and GET for SSE).
2. **[Auth] Build OAuth 2.1 Authorization Server**
   - Implement authorization endpoints, Dynamic Client Registration, and consent UI for users to grant AI agents scoped access.
3. **[Database] Extend Schema for Richer Logging**
   - Add columns: `station_name`, `fuel_grade`, `notes`, and `is_full_tank` to the `app.refuelings` table. Update corresponding views and RPCs.
4. **[Features] Implement Read-Only MCP Tools**
   - Develop and register tools: `list_vehicles`, `get_vehicle_history`, and `get_fuel_summary`. Ensure they properly authenticate using the OAuth token.
5. **[Features] Implement Write-Capable MCP Tools**
   - Develop and register tools: `log_refueling`, `log_service`, and `log_expense`. Validate inputs and map correctly to the Supabase client.
