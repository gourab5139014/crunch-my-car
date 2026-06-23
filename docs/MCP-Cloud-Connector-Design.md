# MCP Cloud Connector Design: Crunch My Car

This document outlines the architectural requirements and design for exposing the Crunch My Car application as a remote Model Context Protocol (MCP) server.

## 1. Literature Survey & Best Practices

### Model Context Protocol (MCP)
MCP is an open standard that enables AI agents (like Claude) to connect with external data and tools. For a cloud-hosted application, the "Cloud Connector" pattern is the standard way to allow users to link their accounts to an agent.

### Transports
The MCP specification defines two primary transports:
- **stdio:** For local servers (not applicable for a cloud connector).
- **Streamable HTTP:** The successor to the legacy HTTP+SSE transport. It uses POST for messages and optionally GET for an SSE stream for server-originated notifications.

### Authentication & Authorization
Remote MCP servers **must** implement proper authentication. The industry standard for cloud connectors is **OAuth 2.0 / 2.1**.
- **Supabase Auth** now supports an **OAuth 2.1 Server** feature, which includes PKCE (Proof Key for Code Exchange) support, ideal for MCP clients.
- Users grant "scopes" to the agent, ensuring the principle of least privilege.

---

## 2. Architecture Decisions

### Transport: Streamable HTTP
- **Decision:** Use the modern **Streamable HTTP** transport.
- **Rationale:** It provides a standard, robust way to handle JSON-RPC over the web and is natively supported by modern MCP clients.

### Hosting Target: Supabase Edge Functions
- **Decision:** Host the MCP server as a **Supabase Edge Function** (Deno).
- **Rationale:**
    - High proximity to the database and Auth service.
    - Native support for environment variables (API keys).
    - Can leverage existing Deno-based utilities (e.g., `scan-refuel`).
    - Scalable and managed infrastructure.

### Backend Data Access
- **Decision:** The MCP server will use the **user's access token** (issued via OAuth) to interact with the Supabase PostgREST API and RPCs.
- **Rationale:** This ensures that all existing **Row Level Security (RLS)** policies are automatically applied, maintaining strict data isolation.

---

## 3. OAuth Scope Model

We will implement granular scopes to allow users to control what an AI agent can do.

| Scope | Description |
| :--- | :--- |
| `cars:read` | View the list of vehicles and their details. |
| `refuelings:read` | View fuel logs and efficiency data. |
| `refuelings:write` | Add or update fuel logs. |
| `services:read` | View maintenance records. |
| `services:write` | Log new maintenance/service records. |
| `expenses:read` | View general expense logs. |
| `expenses:write` | Log new expenses. |
| `analytics:read` | Access aggregated stats and spending trends. |

---

## 4. Draft Tool Manifest

The MCP server will expose the following tools to the AI agent:

### `list_vehicles`
- **Description:** Returns a list of the user's vehicles.
- **Input:** None.

### `log_refueling`
- **Description:** Records a new fuel stop.
- **Input Schema:**
    - `car_id` (UUID, required)
    - `date` (ISO Date, required)
    - `odometer` (Integer, required)
    - `volume` (Number, required)
    - `total_cost` (Number, required)
    - `unit_system` (String: 'metric' | 'imperial')

### `get_vehicle_stats`
- **Description:** Gets a summary of vehicle performance and spending.
- **Input Schema:**
    - `car_id` (UUID, required)

### `get_timeline`
- **Description:** Fetches a combined timeline of refuelings, services, and expenses.
- **Input Schema:**
    - `car_id` (UUID, required)
    - `limit` (Integer, default: 20)

---

## 5. Implementation Roadmap

Based on this design, the following follow-up tasks are required:

1. **Enable Supabase OAuth Server:** Configure `auth.oauth_server` in `config.toml` and implement the consent UI.
2. **Setup MCP Edge Function:** Create a new function `supabase/functions/mcp-connector` using the `@modelcontextprotocol/sdk`.
3. **Implement MCP Tools:** Map the MCP tools to existing Supabase RPCs and table operations.
4. **RLS Policy Review:** Ensure RLS policies allow for `authenticated` access via OAuth tokens (verified by `client_id` if necessary).
5. **Documentation:** Provide a "Connect to Claude" guide for users.

---

## 6. References
- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Supabase MCP Authentication Guide](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [FastMCP for Deno](https://gofastmcp.com/)
