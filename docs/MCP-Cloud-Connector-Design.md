# MCP Cloud Connector Design

This document details the architectural requirements for exposing Crunch My Car as a remote Model Context Protocol (MCP) server. By implementing this, AI agents (like Claude or other MCP-compatible clients) can interact with users' vehicle data seamlessly on their behalf.

## 1. MCP Server Requirements

A remote (cloud-hosted) MCP server fundamentally differs from a local `stdio` MCP server in how it transports messages and maintains connections.

*   **Transport Mechanism:** The standard transport for remote MCP servers is Server-Sent Events (SSE) for the server-to-client stream, paired with HTTP POST requests for client-to-server messages. Therefore, the remote server needs to expose endpoints capable of handling SSE connections and standard HTTP requests.
*   **Hosting Target:** The current stack heavily leverages Supabase. Supabase Edge Functions (running Deno) are a strong candidate for hosting the MCP server. Edge Functions support HTTP streaming natively and run close to the database. A standalone Node/Deno service is an alternative if Edge Functions face timeout or cold-start issues, but sticking to the Supabase ecosystem minimizes operational overhead.

## 2. Authentication & Authorisation

To allow third-party AI agents to access a user's data securely, the MCP connector must implement an OAuth 2.0 flow.

*   **Supabase Auth Integration:** Supabase Auth now supports acting as an OAuth 2.1 identity provider. This allows the MCP client to dynamically discover the configuration, register, and direct the user through an authorization flow where they approve the AI agent's access. The resulting access tokens are JWTs compatible with Supabase Auth.
*   **Proposed OAuth Scopes:** Scopes should adhere to the principle of least privilege.
    *   `vehicles:read` - Read basic car details.
    *   `refuelings:read`, `refuelings:write` - Read and log fuel records.
    *   `services:read`, `services:write` - Read and log maintenance.
    *   `expenses:read`, `expenses:write` - Read and log expenses.
    *   `profile:read` - Read user profile information (e.g., unit preferences).

## 3. Tool Surface Design

The following operations should be exposed as MCP tools. The balance between read and write capabilities is crucial for security.

### Read-Only Tools

**`list_vehicles`**
*   **Description:** Retrieves cars owned by the user.
*   **Input Schema:** None.

**`get_vehicle_history`**
*   **Description:** Retrieves a chronological timeline of logs for a specific vehicle.
*   **Input Schema:**
    ```json
    {
      "type": "object",
      "properties": {
        "car_id": { "type": "string", "description": "The UUID of the car." },
        "limit": { "type": "number", "description": "Maximum number of records to return." }
      },
      "required": ["car_id"]
    }
    ```

**`get_fuel_summary`**
*   **Description:** Retrieves aggregated fuel data (e.g., total cost, avg efficiency).
*   **Input Schema:**
    ```json
    {
      "type": "object",
      "properties": {
        "car_id": { "type": "string", "description": "The UUID of the car." },
        "period": { "type": "string", "enum": ["month", "year", "all_time"] }
      },
      "required": ["car_id"]
    }
    ```

### Write-Capable Tools

**`log_refueling`**
*   **Description:** Adds a new fuel record. Requires `refuelings:write` scope.
*   **Input Schema:**
    ```json
    {
      "type": "object",
      "properties": {
        "car_id": { "type": "string" },
        "date": { "type": "string", "format": "date-time" },
        "odometer": { "type": "number", "description": "Odometer reading at the time of refueling." },
        "volume": { "type": "number", "description": "Amount of fuel added." },
        "cost": { "type": "number", "description": "Total cost of refueling." },
        "notes": { "type": "string", "description": "Optional notes or station name." }
      },
      "required": ["car_id", "date", "odometer", "volume", "cost"]
    }
    ```

**`log_service`**
*   **Description:** Adds a new maintenance record. Requires `services:write` scope.
*   **Input Schema:**
    ```json
    {
      "type": "object",
      "properties": {
        "car_id": { "type": "string" },
        "date": { "type": "string", "format": "date-time" },
        "odometer": { "type": "number" },
        "description": { "type": "string", "description": "Description of the service performed." },
        "cost": { "type": "number" }
      },
      "required": ["car_id", "date", "odometer", "description", "cost"]
    }
    ```

**`log_expense`**
*   **Description:** Adds a new general expense. Requires `expenses:write` scope.
*   **Input Schema:**
    ```json
    {
      "type": "object",
      "properties": {
        "car_id": { "type": "string" },
        "date": { "type": "string", "format": "date-time" },
        "description": { "type": "string", "description": "Description of the expense (e.g., insurance, washing)." },
        "cost": { "type": "number" }
      },
      "required": ["car_id", "date", "description", "cost"]
    }
    ```

*Note on Risk:* Write operations (especially those that might delete or significantly alter historical data, if implemented) should ideally require user confirmation, although standard MCP implementations rely on the client (the AI agent's UI) to prompt the user before executing tool calls that mutate state.

## 4. API / Data Access Layer

Currently, the frontend directly calls the Supabase JS client. The MCP server needs a secure way to access the database on behalf of the user.

*   **Access Strategy:** The MCP server (e.g., the Supabase Edge Function) should *not* use the service role key to bypass RLS. Instead, it should instantiate a Supabase client using the OAuth access token provided by the MCP client.
*   **Row Level Security (RLS):** By using the user's OAuth access token, the existing RLS policies defined in the `app` schema will automatically apply, ensuring the AI agent can only read/write data belonging to that specific user. No extension to RLS policies should be necessary, provided the token correctly identifies the `auth.uid()`.

## 5. Schema & Capability Gaps

Reviewing the current `app` schema versus potential agent interactions:

*   **Missing Fields:**
    *   `refuelings`: May lack fields for `station_name`, `fuel_grade`, or general `notes` which an agent might extract from a receipt or user prompt.
    *   `services`: Might need more structured fields for `mechanic_name` or `service_type` rather than relying solely on a generic description.
*   **Derived Data vs. Raw Data:** While raw records are essential, agents often need to answer aggregate questions (e.g., "How much did I spend this month?"). Exposing derived data through the `get_fuel_summary` tool (potentially backed by existing Postgres RPCs or Views like `vehicle_timeline_view`) is more efficient than forcing the agent to fetch all raw records and calculate it itself.

## Concrete Follow-up Implementation Issues

1.  [ ] **Issue: Enable and configure Supabase OAuth 2.1 Server.** Setup the authorization endpoints and configure dynamic client registration.
2.  [ ] **Issue: Create Supabase Edge Function for MCP Server.** Scaffold a Deno Edge Function that implements the SSE transport for MCP.
3.  [ ] **Issue: Implement read-only MCP tools.** Implement `list_vehicles`, `get_vehicle_history`, and `get_fuel_summary` tools within the Edge Function, ensuring they use the user's OAuth token for RLS.
4.  [ ] **Issue: Implement write-capable MCP tools.** Implement `log_refueling`, `log_service`, and `log_expense` tools.
5.  [ ] **Issue: Schema Enhancements.** Add supplementary columns (like `notes` or `station_name`) to the `refuelings` and `services` tables to better support rich data extraction by AI agents.
