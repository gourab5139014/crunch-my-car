# MCP Cloud Connector Design

## Overview

This document explores the architectural changes required to expose the Crunch My Car application as a **remote MCP (Model Context Protocol) server**. This will allow AI agents (e.g., Claude, or any MCP-compatible client) to securely interact with a user's vehicle data on their behalf over the internet.

## 1. MCP Server Requirements

A remote (cloud-hosted) MCP server differs from a local `stdio` server in that it must handle communication over a network securely and manage stateful connections for potentially multiple clients simultaneously.

### Transport Mechanisms
According to the MCP specification for remote transport:
*   **Transport Mechanism:** A remote MCP server should use **Streamable HTTP** transport.
*   **How it works:**
    *   The client uses `HTTP POST` to send JSON-RPC messages (requests, notifications) to a single MCP endpoint (e.g., `https://example.com/mcp`).
    *   The server can optionally use Server-Sent Events (SSE) by returning `Content-Type: text/event-stream` to stream multiple messages (like requests from server to client or server notifications).
    *   Alternatively, the server can return a single JSON response using `Content-Type: application/json`.
*   **Difference from `stdio`:** `stdio` is strictly for local processes communicating via standard input/output. Streamable HTTP handles network connections, requires an HTTP server, and uses standard web protocols (POST/SSE) to simulate bidirectional JSON-RPC.

### Hosting Target Options
Given the current stack uses Supabase (Auth, Database, Edge Functions):
*   **Option A: Supabase Edge Functions (Deno)**
    *   **Pros:** Same infrastructure, low latency to the database, straightforward deployment, built-in access to Supabase client environment variables.
    *   **Cons:** SSE handling in serverless environments can sometimes have timeout limits or connection count limits.
*   **Option B: Standalone Node.js/Deno Service (e.g., via Render, Fly.io, or Railway)**
    *   **Pros:** Dedicated process, full control over SSE connections, easier to maintain long-lived streams if required by the MCP client.
    *   **Cons:** Added infrastructure overhead, slightly more complex deployment.

**Decision:** Given the simplicity and existing integration, **Supabase Edge Functions** is the recommended initial hosting target. Deno supports SSE natively (`ReadableStream`), and it aligns perfectly with the current architecture.

## 2. Authentication & Authorisation

MCP cloud connectors require robust authorisation so users can securely grant AI agents access without sharing their raw credentials.

### OAuth 2.0 Integration
Since MCP relies on OAuth 2.0 or similar secure bearer token mechanisms for remote servers:
*   **Current State:** Supabase Auth issues JWTs for first-party clients (the frontend).
*   **Required State:** To support third-party AI agents, we need an **OAuth 2.0 Authorization Server** flow.
*   **Implementation:**
    1.  **Client Registration:** AI agent providers (e.g., Anthropic) need to register as a client application.
    2.  **Authorization Code Flow:** The AI agent redirects the user to our app. The user logs in via Supabase Auth and is presented with a consent screen ("Do you want to grant Claude access to your vehicle logs?").
    3.  **Token Issuance:** Upon consent, an authorization code is issued, which the AI agent exchanges for an Access Token (and Refresh Token).
    4.  **Token Validation:** The MCP server (Edge Function) receives requests with the Access Token in the `Authorization: Bearer <token>` header, validates the token, and extracts the user ID and scopes.
    *   *Note: Supabase does not natively act as an OAuth 2.0 Authorization Server for third parties out-of-the-box. We will likely need to build a custom OAuth flow (issuing our own scoped JWTs) or integrate a provider like Auth0/Ory for the OAuth provider role, while keeping user identities in Supabase.*

### Proposed OAuth Scopes
To adhere to the principle of least privilege, we propose the following scopes:
*   `vehicles:read` - View vehicles, fleet stats, and timelines.
*   `refuelings:read` - View fuel logs and efficiency trends.
*   `refuelings:write` - Log new refuelings.
*   `services:read` - View maintenance history.
*   `services:write` - Log new service records.
*   `expenses:read` - View general expenses.
*   `expenses:write` - Log new expenses.

## 3. Tool Surface Design

The following operations are excellent candidates for MCP tools.

### Read-Only Tools (Low Risk)

*   `list_vehicles`
    *   **Description:** Retrieves a list of the user's vehicles and their basic details.
    *   **Input:** None.
*   `get_vehicle_history`
    *   **Description:** Gets the unified timeline of refuelings, services, and expenses for a specific car.
    *   **Input:** `car_id` (string/UUID).
*   `get_fuel_summary`
    *   **Description:** Retrieves fuel efficiency trends, total spend, and high-level stats for a vehicle.
    *   **Input:** `car_id` (string/UUID).

### Write-Capable Tools (Medium Risk)

*   `log_refueling`
    *   **Description:** Logs a new refueling event (volume, cost, odometer).
    *   **Input:** `car_id` (UUID), `date` (string), `odometer` (number), `volume` (number), `total_cost` (number), `is_missed` (boolean, optional).
*   `log_service`
    *   **Description:** Logs a maintenance or service event.
    *   **Input:** `car_id` (UUID), `date` (string), `odometer` (number), `description` (string), `total_cost` (number).
*   `log_expense`
    *   **Description:** Logs a general vehicle expense (e.g., insurance, washing).
    *   **Input:** `car_id` (UUID), `date` (string), `amount` (number), `category` (string), `description` (string, optional).

**Safety Considerations:**
Write operations (logging events) are generally safe to expose without secondary confirmation because users typically *want* the agent to perform the action immediately, and the data is non-destructive (it adds a new row, it doesn't delete the car). However, destructive operations (e.g., `delete_vehicle`) should strictly **not** be exposed as MCP tools.

## 4. API / Data Access Layer

Currently, the frontend interacts with Supabase directly via the JS client, leveraging Row Level Security (RLS).

### MCP Server Data Access
*   The MCP server will operate server-side.
*   When a request arrives, the MCP server extracts the User ID from the valid OAuth Bearer token.
*   **Direct DB Access vs REST/RPC:** The MCP server should use the Supabase JS client instantiated **with the user's JWT** (or overriding the auth header).
    ```typescript
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${user_oauth_jwt}`,
        },
      },
      db: { schema: 'app' } // CRITICAL: Always target app schema
    });
    ```
*   **RLS Policies:** Existing RLS policies on the `app` schema enforce that `user_id = auth.uid()`. By passing a properly signed JWT representing the user, the existing RLS policies will automatically apply, preventing the AI agent from accessing another user's data.

## 5. Schema & Capability Gaps

Reviewing the current `app` schema, there are a few gaps that would improve the AI agent's effectiveness:

### Missing Fields / Metadata
1.  **Refuelings Table:**
    *   `fuel_grade` (e.g., Regular, Premium, Diesel). Agents might parse this from receipts.
    *   `station_name` (e.g., Shell, BP). Useful for agent queries like "How much did I spend at Shell?"
    *   `notes` (text). General context the agent extracts.
2.  **Services Table:**
    *   `mechanic_name` or `shop_name`.

### Derived Data
*   The current database contains RPC functions like `app.get_vehicle_stats` and `app.get_fuel_efficiency_trend`. These are perfect for exposing derived data. The MCP server should call these RPC functions rather than fetching raw rows and calculating efficiency server-side, ensuring business logic remains in the database.

---

## Follow-up Implementation Issues

1.  **Issue: Set up Custom OAuth 2.0 Authorization Flow**
    *   Create a mechanism to register third-party clients, handle user consent, and issue scoped JWTs that the Supabase DB can validate (or handle validation manually in the Edge Function before impersonating the user).
2.  **Issue: Scaffold MCP Server Edge Function**
    *   Create a new Supabase Edge Function to handle `POST` and `GET` requests for the Streamable HTTP MCP transport.
    *   Implement SSE support.
3.  **Issue: Implement MCP Tool Handlers**
    *   Map the proposed tools (`list_vehicles`, `log_refueling`, etc.) to Supabase API calls.
    *   Ensure the Supabase client correctly targets the `app` schema.
4.  **Issue: Expand Database Schema**
    *   Create a migration to add `fuel_grade`, `station_name`, and `notes` to `app.refuelings`.
    *   Create a migration to add `shop_name` to `app.services`.
