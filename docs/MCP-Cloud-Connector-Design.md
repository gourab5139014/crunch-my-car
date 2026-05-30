# MCP Cloud Connector Design

## 1. Literature Survey & Best Practices

This document outlines the architectural changes needed to expose "Crunch My Car" as a remote MCP (Model Context Protocol) server. By doing so, the application will act as a cloud connector, allowing users to interact with their vehicle data seamlessly through AI agents (e.g., Claude) using natural language.

### 1.1 MCP Server Requirements

**Remote vs. Local MCP Servers:**
*   **Local (stdio):** Typically runs on the user's machine, communicating directly via standard input/output with a local AI client (like Claude Desktop). Authentication is usually assumed by the local execution context.
*   **Remote (Cloud-hosted):** Runs on a server and communicates over the network. It must expose a well-defined transport layer. The primary transport protocols for remote MCP are:
    *   **SSE (Server-Sent Events):** Ideal for server-to-client streaming. The client connects via HTTP and receives a stream of events. For sending messages back to the server, the client uses standard HTTP POST requests to a separate endpoint provided by the server during the SSE connection initialization. This is the recommended approach for cloud-hosted MCP servers as it bypasses many firewall/NAT issues associated with raw WebSockets while still providing a robust push mechanism.
    *   **HTTP (Stateless):** While technically possible, building a fully stateless HTTP MCP server is complex due to the protocol's asynchronous nature and stateful requirements (like active prompts or ongoing tool executions).

**Core Components of a Remote MCP Server:**
1.  **Transport Implementation:** Handling the SSE connection lifecycle and routing incoming POST requests.
2.  **Protocol Handlers:** Parsing incoming JSON-RPC messages according to the MCP specification.
3.  **Tool Manifest:** Exposing a list of available capabilities (tools) along with their JSON Schema inputs.
4.  **Execution Engine:** Routing tool execution requests to the appropriate backend logic (e.g., Supabase database queries).
5.  **Security/Auth Layer:** Crucial for cloud deployments to ensure the AI agent is acting on behalf of an authenticated user.

**Hosting Options for Current Stack (Supabase/Vite/React):**
Given the existing Supabase backend, there are a few primary hosting targets:
*   **Supabase Edge Functions:**
    *   *Pros:* Co-located with the database (low latency), zero infrastructure management, built-in access to Supabase environment variables.
    *   *Cons:* Cold starts can affect the initial SSE connection latency. The Deno runtime might have slightly different libraries available compared to standard Node.js, though MCP SDKs generally support standard web APIs.
*   **Standalone Node.js / Deno Service (e.g., Vercel, Render, Fly.io):**
    *   *Pros:* Full control over the runtime environment, potentially better sustained performance for long-running SSE connections.
    *   *Cons:* Requires setting up and managing a separate deployment pipeline, managing secrets separately from Supabase.
*   **Vercel Serverless/Edge Functions (Since the frontend is moving to Vercel):**
    *   *Pros:* Integrated with frontend deployment, good developer experience.
    *   *Cons:* Vercel Serverless Functions have execution time limits which can be problematic for long-running SSE connections unless carefully managed or using specific long-polling techniques.

### 1.2 Authentication & Authorization

To securely allow AI agents to access a user's data, an OAuth 2.0 flow is required.

**Current Setup vs. Required Changes:**
Currently, the application likely uses Supabase Auth (GoTrue) for direct user login (e.g., email/password or social login via the frontend).
To support third-party AI agents, "Crunch My Car" must become an **OAuth 2.0 Provider**.

1.  **OAuth App Registration:** The application needs a mechanism to register third-party clients (the AI agents).
2.  **Authorization Endpoint:** An endpoint where the user is redirected to approve the agent's access requests.
3.  **Token Endpoint:** An endpoint for the agent to exchange an authorization code for an Access Token and a Refresh Token.
4.  **Token Validation:** The MCP server must validate the incoming Access Token (usually a JWT sent in the `Authorization: Bearer <token>` header) before processing any requests.

*Note: Supabase does not natively act as a full-featured standalone OAuth provider out-of-the-box in a way that lets you issue tokens to arbitrary third parties easily without significant custom logic.* Therefore, implementing this might require:
*   Building a custom OAuth provider layer (e.g., using a library like `oauth2-server` in a dedicated Node.js service).
*   Or, leveraging a dedicated identity provider (like Auth0, Clerk, or Ory) that supports acting as an OAuth provider, although this complicates the architecture.
*   Alternatively, for a simpler initial prototype, a **Personal Access Token (PAT)** system could be implemented. Users generate a token in the "Crunch My Car" UI and paste it into their AI agent's configuration.

### 1.3 Tool Surface Design

The tools exposed should map directly to user intents.

**Candidate Tools:**

1.  **`list_vehicles` (Read-only)**
    *   *Description:* Retrieves a list of vehicles owned by the user.
    *   *Risk:* Low.

2.  **`get_vehicle_history` (Read-only)**
    *   *Description:* Retrieves the recent timeline of events (refuelings, services, expenses) for a specific vehicle.
    *   *Risk:* Low.

3.  **`get_fuel_summary` (Read-only)**
    *   *Description:* Calculates fuel statistics (e.g., total spent, average efficiency) over a specified time period.
    *   *Risk:* Low.

4.  **`log_refueling` (Write-capable)**
    *   *Description:* Records a new refueling event (odometer, volume, cost, etc.).
    *   *Risk:* Medium. Can pollute data if incorrect, but easily reversible.

5.  **`log_service` (Write-capable)**
    *   *Description:* Records a maintenance or service event.
    *   *Risk:* Medium.

6.  **`log_expense` (Write-capable)**
    *   *Description:* Records a general vehicle expense (insurance, registration, etc.).
    *   *Risk:* Medium.

**Risky Operations:**
Destructive operations (e.g., `delete_vehicle`, `delete_record`) should generally **not** be exposed to the agent directly without explicit user confirmation in the app UI, or should be omitted entirely from the initial MCP surface to minimize risk.

### 1.4 API / Data Access Layer

When the MCP server handles a request, it acts on behalf of the user.

**Supabase Integration:**
*   The MCP server should authenticate the user based on the provided token (OAuth Access Token or PAT).
*   Once authenticated, the server should ideally leverage the existing Supabase **Row Level Security (RLS)** policies.
*   **Implementation Strategy:** The MCP server (e.g., an Edge Function) receives the request, extracts the user ID from the token, and initializes a Supabase client acting *as that specific user*.
    ```javascript
    // Example: Initializing Supabase client with user context
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      },
    })
    ```
*   By doing this, the MCP server does not need to use the `service_role` key (which bypasses RLS). This ensures that the agent cannot access data the user themselves cannot access, providing a strong security guarantee. A thin RPC/REST layer is not strictly necessary if the MCP server itself translates tool calls directly into Supabase JS client calls using user-scoped credentials.

### 1.5 Schema & Capability Gaps

To improve agent interactions, the current schema might need enhancements:

**Missing Fields/Metadata:**
*   **`Refuelings` table:**
    *   `fuel_grade` (e.g., Regular, Premium, Diesel).
    *   `station_name` or `location` (useful for contextual queries like "Where did I fill up last?").
    *   `is_full_tank` (boolean, critical for accurate fuel efficiency calculations).
    *   `notes` (text field for agent to store additional context from the user's prompt).
*   **`Services` table:**
    *   `provider_name` (e.g., "Jiffy Lube", "Local Mechanic").
    *   `next_service_due_date` or `next_service_due_odometer` (crucial for reminder queries).

**Derived/Aggregated Data:**
The connector should primarily expose raw records and allow the AI agent (which is good at reasoning and math) to calculate simple metrics. However, for complex or performance-intensive aggregations (e.g., "lifetime cost per km across all vehicles"), exposing a specific tool that calls a Supabase RPC function (`get_fuel_summary`) is preferable to having the agent download thousands of raw records to calculate it itself.

---

## 2. Design Decisions

### 2.1 MCP Transport & Hosting Target
*   **Decision:** **SSE (Server-Sent Events) Transport** over HTTP.
*   **Hosting Target:** **Supabase Edge Functions** (or a standalone Node/Deno service if Edge Function limits prove problematic for long-lived SSE connections). Given the tight integration with Supabase, Edge Functions are the best starting point for a prototype. If SSE connection dropping is frequent, a migration to a Vercel/Node service might be necessary later.

### 2.2 Proposed OAuth Scope Model

A granular scope model ensures the agent only has the permissions necessary for its tasks.

*   `vehicles:read` - View vehicle details.
*   `vehicles:write` - Add or update vehicles.
*   `records:read` - View refuelings, services, and expenses.
*   `records:write` - Add new refuelings, services, and expenses.
*   *Note for Prototype:* Implementing a full OAuth Provider is complex. **Phase 1 recommendation is to use Personal Access Tokens (PATs)** generated in the app UI, which the user provides to the AI agent. These PATs would map to a specific user and could optionally be scoped.

### 2.3 Draft Tool Manifest

```json
{
  "tools": [
    {
      "name": "list_vehicles",
      "description": "Returns a list of all vehicles owned by the authenticated user, including their IDs, make, model, and year.",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "required": []
      }
    },
    {
      "name": "log_refueling",
      "description": "Records a new refueling event for a specific vehicle.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "vehicle_id": { "type": "string", "description": "The UUID of the vehicle." },
          "odometer": { "type": "number", "description": "The current odometer reading." },
          "volume": { "type": "number", "description": "The amount of fuel added (e.g., in liters or gallons)." },
          "cost": { "type": "number", "description": "The total cost of the refueling." },
          "is_full_tank": { "type": "boolean", "description": "Whether the tank was filled to capacity." },
          "notes": { "type": "string", "description": "Optional notes about the refueling." }
        },
        "required": ["vehicle_id", "odometer", "volume", "cost"]
      }
    },
    {
      "name": "get_vehicle_history",
      "description": "Retrieves recent logs (refueling, service, expense) for a vehicle.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "vehicle_id": { "type": "string", "description": "The UUID of the vehicle." },
          "limit": { "type": "number", "description": "Maximum number of records to return (default: 10)." }
        },
        "required": ["vehicle_id"]
      }
    }
  ]
}
```

---

## 3. Follow-up Implementation Issues

Based on this design, the following concrete issues should be created to implement the MCP Cloud Connector:

1.  **[Schema] Enhance Database Schema for Agent Context:**
    *   Add `fuel_grade`, `station_name`, `is_full_tank`, `notes` to `Refuelings`.
    *   Add `provider_name`, `next_service_due_date`, `next_service_due_odometer` to `Services`.
2.  **[Auth] Implement Personal Access Token (PAT) System:**
    *   Create a database table to store PATs securely (hashed).
    *   Build a UI for users to generate and revoke PATs.
    *   Implement an authentication middleware to validate PATs via Supabase edge functions or backend.
3.  **[Backend] Create Supabase Edge Function for MCP Server (SSE):**
    *   Set up a new Edge Function to handle the SSE transport lifecycle.
    *   Implement the routing logic for incoming MCP messages.
4.  **[Backend] Implement Tool Handlers:**
    *   Implement the logic for `list_vehicles`, `log_refueling`, and `get_vehicle_history` tools, ensuring they use the user-scoped Supabase client (respecting RLS).
5.  **[Backend] Create Analytics RPCs:**
    *   Implement PostgreSQL functions (RPCs) for metrics like `get_fuel_summary` to avoid the agent needing to fetch raw data for aggregations.
