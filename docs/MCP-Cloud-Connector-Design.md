# MCP Cloud Connector Design: Crunch My Car

This document outlines the architecture and design for exposing the "Crunch My Car" application as a remote Model Context Protocol (MCP) server. This allows AI agents to interact with vehicle data on behalf of the user.

## 1. Literature Survey & Best Practices

### MCP Transports
The Model Context Protocol supports two primary transports:
*   **stdio**: Best for local tools running on a user's machine.
*   **Streamable HTTP** (formerly HTTP+SSE): Required for cloud-to-cloud connectors. It uses standard HTTP POST for messages and optionally GET for an SSE stream.

**Decision:** We will use **Streamable HTTP**. It is the standard for remote servers and fits perfectly with a serverless architecture where persistent connections (like stdio) are not feasible.

### Hosting & Runtime
*   **Supabase Edge Functions (Deno):** Our current stack already uses Edge Functions. Deno is highly compatible with the MCP TypeScript SDK (via `npm:@modelcontextprotocol/sdk`). Edge Functions provide low latency and direct integration with Supabase Auth.
*   **Alternative:** Standalone Node.js on Vercel. While possible, keeping logic within the Supabase ecosystem simplifies security and data access.

**Decision:** Host the MCP server as a **Supabase Edge Function** (e.g., `/functions/mcp-connector`).

## 2. Authentication & Authorization

MCP cloud connectors rely on OAuth 2.1 to bridge the user's session with the AI agent's requests.

### Supabase OAuth 2.1 Server
We will leverage the built-in [Supabase Auth OAuth Server](https://supabase.com/docs/guides/auth/oauth-server) feature.
*   **Configuration:** Enable `[auth.oauth_server]` in `supabase/config.toml`.
*   **Flow:** The AI agent (MCP Client) redirects the user to our Supabase project to authorize access.
*   **Token Issuance:** Supabase issues an Access Token to the agent.

### Proposed Scope Model
We will implement granular scopes to follow the principle of least privilege:
*   `vehicles:read`: List vehicles and view basic info.
*   `records:read`: Read refuelings, services, and expenses.
*   `records:write`: Add or update refuelings, services, and expenses.
*   `offline_access`: For persistent agent access (refresh tokens).

## 3. Tool Surface Design

The following tools will be exposed via the MCP server manifest:

| Tool Name | Operation | Description |
| :--- | :--- | :--- |
| `list_vehicles` | READ | Returns a list of all vehicles owned by the user. |
| `get_vehicle_stats` | READ | Returns summary statistics (efficiency, total spend) for a car. |
| `get_vehicle_history` | READ | Returns a chronological timeline of all activities for a car. |
| `log_refueling` | WRITE | Records a new fuel stop (odometer, volume, cost). |
| `log_service` | WRITE | Records a service/maintenance event. |
| `log_expense` | WRITE | Records a general vehicle expense. |

### Security & Confirmation
Write operations (`log_*`) should be designed such that the agent provides a clear summary to the user before or after execution. While MCP doesn't natively enforce "confirm before call" in the protocol, clients like Claude often do for write-capable tools.

## 4. API & Data Access Layer

### RLS Enforcement
The MCP Edge Function will:
1. Receive an MCP request with an Authorization header (Bearer token).
2. Use `supabase-js` to create a client with the user's access token.
3. Call existing Postgres RPCs or table operations.
4. **Result:** RLS policies defined in Phase 1 will automatically restrict the agent to only the user's data.

### Implementation Architecture
```
[AI Agent] -> [Streamable HTTP] -> [Supabase Edge Function] -> [Supabase DB (RLS)]
```

## 5. Schema & Capability Gaps
*   **Notes Field:** AI agents often extract "context" from user speech (e.g., "The station was really busy"). We should ensure the `notes` or `description` fields are used to capture this unstructured data.
*   **Aggregated Data:** The server should expose the RPCs from Phase 4 (`get_vehicle_stats`, `get_monthly_spending`) as tools, as agents are better at interpreting summaries than calculating them from raw logs.

## 6. Follow-up Implementation Issues

Based on this design, the following issues should be created for implementation:

1.  **[Infra] Enable Supabase OAuth 2.1 Server**: Update `supabase/config.toml` and verify local/remote availability of the OAuth endpoints (`/auth/v1/oauth/...`).
2.  **[Backend] Implement `mcp-connector` Edge Function Scaffold**: Use the MCP TypeScript SDK to set up a Deno-based Edge Function that handles the Streamable HTTP lifecycle (POST for messages, GET for SSE).
3.  **[Backend] Implement Read-Only MCP Tools**: Map `list_vehicles`, `get_vehicle_stats`, and `get_vehicle_history` to the MCP server.
4.  **[Backend] Implement Write-Capable MCP Tools**: Map `log_refueling`, `log_service`, and `log_expense` to the MCP server, ensuring proper validation of input schemas.
5.  **[Security] Define and Test MCP OAuth Scopes**: Ensure the Edge Function correctly validates the scopes present in the JWT issued by the OAuth server.
