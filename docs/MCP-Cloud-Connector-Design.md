# MCP Cloud Connector Design

This document outlines the architectural changes required to expose the "Crunch My Car" application as a remote Model Context Protocol (MCP) server. This allows AI agents (e.g., Claude) to interact with user vehicle data securely and efficiently on their behalf.

## 1. MCP Server Requirements

A remote MCP server allows AI agents to interface with our application over the network, as opposed to a local `stdio` connection.

*   **Transport Mechanism:** To operate as a cloud connector, the server must support the **Streamable HTTP transport** (replacing the older HTTP with Server-Sent Events (SSE) from earlier versions of the specification).
*   **Hosting Target:** Since our infrastructure leverages Supabase, utilizing **Supabase Edge Functions** (Deno) is a highly suitable and scalable choice. Edge Functions can handle standard HTTP POST and GET requests natively, aligning with the Streamable HTTP requirements for JSON-RPC message exchange.
*   **Endpoints:** We need to expose a single MCP endpoint (e.g., `/api/mcp`) that accepts both HTTP POST and GET requests.
*   **Capabilities:** The server needs to respond to `tools/list` requests with a manifest detailing available functions and their JSON schemas for parameters.

## 2. Authentication & Authorisation

To allow third-party AI agents to access a user's data, we must implement a secure authorization flow.

*   **OAuth 2.0:** We must implement an OAuth 2.0 provider flow. Since Supabase handles authentication but acts primarily as an Identity Provider for our first-party app, we need to build an OAuth2 authorization endpoint to issue access tokens to third-party agents. This can also be implemented via Supabase Edge Functions.
*   **Token Verification:** The MCP Edge Function will need to validate the provided OAuth bearer token on incoming requests and establish the user context.

**Proposed OAuth Scope Model:**
Granular scopes should be defined to follow the principle of least privilege:
*   `vehicles:read` - View vehicles and their basic details.
*   `refuelings:read` - View refueling history.
*   `refuelings:write` - Log new refuelings.
*   `services:read` - View service history.
*   `services:write` - Log new services.
*   `expenses:read` - View general expenses.
*   `expenses:write` - Log general expenses.

## 3. Tool Surface Design

The following operations should be exposed as tools to the AI agents.

**Draft Tool Manifest:**

1.  **`list_vehicles` (Read-only)**
    *   *Description:* Retrieves the user's vehicles. Required to get car IDs for other operations.
    *   *Input Schema:* `{ "type": "object", "properties": {} }`
2.  **`log_refueling` (Write)**
    *   *Description:* Logs a fuel stop.
    *   *Input Schema:*
        *   `car_id` (string, UUID): The ID of the car.
        *   `date` (string, YYYY-MM-DD): The date of the refueling.
        *   `odometer` (integer): Current odometer reading.
        *   `volume` (number): The volume of fuel (liters/gallons based on car unit preference).
        *   `total_cost` (number): The total cost of the refueling.
3.  **`log_service` (Write)**
    *   *Description:* Logs a service event or repair.
    *   *Input Schema:*
        *   `car_id` (string, UUID): The ID of the car.
        *   `date` (string, YYYY-MM-DD): The date of the service.
        *   `odometer` (integer): Current odometer reading.
        *   `description` (string): Description of the service performed.
        *   `total_cost` (number): Total cost of the service.
4.  **`log_expense` (Write)**
    *   *Description:* Logs a general vehicle expense (e.g., insurance, washing, tolls).
    *   *Input Schema:*
        *   `car_id` (string, UUID): The ID of the car.
        *   `date` (string, YYYY-MM-DD): The date of the expense.
        *   `amount` (number): Total cost of the expense.
        *   `description` (string, optional): Description of the expense.
        *   `category` (string, optional): Expense category.
5.  **`get_vehicle_history` (Read-only)**
    *   *Description:* Returns a combined timeline of refuelings, services, and expenses for a specific car.
    *   *Input Schema:*
        *   `car_id` (string, UUID): The ID of the car.
6.  **`get_fuel_summary` (Read-only)**
    *   *Description:* Returns aggregated fuel metrics (e.g., total spent, average efficiency) for a specific car.
    *   *Input Schema:*
        *   `car_id` (string, UUID): The ID of the car.

*Risky Operations:* Destructive operations like `delete_vehicle` or `delete_refueling` should *not* be exposed via MCP initially to prevent accidental data loss by the agent. Modifications should require direct user interaction in the web app.

## 4. API / Data Access Layer

Currently, the React frontend interacts with Supabase directly via the JS client, utilizing Row Level Security (RLS) policies.

*   **Integration with RLS:** The MCP server (Edge Function) must preserve these security guarantees. When an AI agent connects with an OAuth access token, the Edge Function must validate the token, extract the `user_id`, and instantiate a Supabase client configured with that user's context. This ensures all existing RLS rules remain enforced during database queries.
*   **Thin Layer:** The MCP tools will sit behind a thin REST/RPC layer within the Edge Function. The function will parse the MCP tool call, translate it into the corresponding Supabase JS client calls, and return the formatted MCP response.

## 5. Schema & Capability Gaps

Reviewing the current baseline schema (`app.refuelings`, `app.services`, `app.expenses`, `app.cars`), there are a few gaps that would enrich agent interactions:

*   **Fuel/Station Metadata:** `app.refuelings` currently tracks `date`, `odometer`, `volume`, and `total_cost`. It lacks `fuel_grade` (e.g., "Premium", "Regular") and `station_name` or `location`. Adding optional `notes` or `station_name` fields would allow an agent to record more natural language input ("I filled up at Shell").
*   **Derived Data:** While agents can calculate metrics from raw data, providing robust derived metrics (cost per distance, average fuel efficiency) via a tool like `get_fuel_summary` is more efficient and ensures consistency with the frontend application.
*   **Unit Preferences:** The schema includes `unit_preference` (`metric` vs `imperial`) on cars. The MCP server needs to expose this preference to agents, so they know whether to send/display liters or gallons, and kilometers or miles.

---

## Concrete Follow-up Implementation Issues

1.  **[OAuth 2.0 Provider] Implement OAuth Authorization Edge Function:** Create the endpoints necessary to allow third-party AI agents to request and receive user-scoped access tokens.
2.  **[MCP Server] Setup Streamable HTTP Edge Function:** Implement the core MCP server protocol handling JSON-RPC requests over HTTP POST/GET in a Supabase Edge Function.
3.  **[MCP Tools] Implement Tool Handlers:** Develop the server-side logic for the defined tools (`list_vehicles`, `log_refueling`, etc.), ensuring proper Supabase client instantiation to respect RLS policies.
4.  **[Database Schema] Add Contextual Fields to Refuelings:** Update the `app.refuelings` table to include optional `station_name` and `notes` fields to better capture conversational inputs.
