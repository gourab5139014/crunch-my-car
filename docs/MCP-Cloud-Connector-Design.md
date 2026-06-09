# MCP Cloud Connector Design

## 1. MCP Server Requirements
To expose Crunch My Car as a remote cloud connector, the server needs to support the **Streamable HTTP** transport (replacing the older HTTP+SSE transport) as defined in the latest Model Context Protocol (MCP) specification.

### Remote Server Characteristics:
- **Transport:** Uses HTTP POST and GET requests, optionally making use of Server-Sent Events (SSE) to stream multiple server messages.
- **Endpoint:** Exposes a single HTTP endpoint path (e.g., `https://api.crunchmycar.com/mcp`) supporting both GET and POST methods.
- **State Management:** Optionally manages stateful sessions using an `Mcp-Session-Id` header.

### Differences from Local stdio:
A local `stdio` server communicates over standard input/output with a local client application. A cloud connector must authenticate requests remotely and handle potentially many independent client connections simultaneously.

### Hosting Target Decision:
**Supabase Edge Functions (Deno)** is the ideal hosting target given the current technology stack. Edge functions run natively near the user, integrate perfectly with Supabase's authentication and data layers, and can handle HTTP requests and SSE streaming, perfectly matching the Streamable HTTP requirements for an MCP server.

## 2. Authentication & Authorisation
To enable AI agents to act on behalf of the user, the cloud connector must support **OAuth 2.0**. AI agents will use an OAuth flow to obtain access tokens.

### Setup Requirements:
- We need to implement an OAuth 2.0 authorization server component, potentially via a Supabase Edge Function that issues and validates tokens.
- Alternatively, we can investigate whether Supabase's built-in Auth supports third-party OAuth app registrations (issuing tokens to external clients) or if a lightweight wrapper is needed.

### Proposed OAuth Scope Model:
Scopes should follow a principle of least privilege, allowing users to restrict agents from performing destructive actions.

- `vehicles:read` - Allows reading vehicle details.
- `vehicles:write` - Allows adding/updating vehicles.
- `logs:read` - Allows reading refuelings, expenses, and services.
- `logs:write` - Allows logging new refuelings, expenses, and services.
- `analytics:read` - Allows access to derived aggregated data (e.g., fuel summaries, histories).

## 3. Tool Surface Design

### Draft Tool Manifest

| Tool Name             | Capability / Description                                      | Input Schema                                                                                        | Read/Write | Risky? |
|-----------------------|---------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|------------|--------|
| `list_vehicles`       | Returns a list of the user's vehicles and basic details.      | `{}`                                                                                                | Read       | No     |
| `get_vehicle_history` | Returns a timeline of services, expenses, and refuelings.     | `{ "car_id": "string (UUID)", "limit": "number (optional)" }`                                       | Read       | No     |
| `get_fuel_summary`    | Returns aggregated statistics like total spent or efficiency. | `{ "car_id": "string (UUID)", "period_days": "number (optional)" }`                                 | Read       | No     |
| `log_refueling`       | Logs a new refueling entry.                                   | `{ "car_id": "UUID", "date": "string (YYYY-MM-DD)", "odometer": "number", "liters": "number", "total_cost": "number", "fuel_grade": "string (opt)", "notes": "string (opt)" }` | Write      | No     |
| `log_service`         | Logs a new service record.                                    | `{ "car_id": "UUID", "date": "string", "odometer": "number", "description": "string", "total_cost": "number", "service_type": "string (opt)" }` | Write      | No     |
| `log_expense`         | Logs a general car expense.                                   | `{ "car_id": "UUID", "date": "string", "amount": "number", "description": "string", "category": "string (opt)" }` | Write      | No     |

**Risky Operations:** Deleting records (e.g., `delete_vehicle` or `delete_refueling`) should *not* be exposed to the agent directly to avoid accidental data loss. Write operations like `log_refueling` are generally safe as they just append data.

## 4. API / Data Access Layer

### Architecture Decision:
The MCP server (running in a Supabase Edge Function) should **not** use the Service Role key to bypass RLS. Instead, it should pass the agent's OAuth access token (which is mapped to the specific user) into the Supabase JS Client.

### RLS Policies:
By forwarding the user-scoped JWT, the existing Row Level Security (RLS) policies on the `app.cars`, `app.refuelings`, `app.services`, and `app.expenses` tables will automatically enforce access control. No major changes to RLS policies should be necessary, provided the agent's JWT is correctly recognized as the authenticated user.

## 5. Schema & Capability Gaps

### Missing Fields:
To provide a richer experience for AI agents parsing natural language (e.g., receipts or free-text inputs), the current schema could be expanded:
- **Refuelings:** Add `fuel_grade` (e.g., Premium, Regular), `station_name`, and a `notes` field.
- **Services:** Add `service_type` (e.g., Oil Change, Tire Rotation, Repair).
- **All Tables:** A `receipt_image_url` field to link back to the source image (useful if an agent scanned a receipt).

### Derived Data:
Agents benefit from aggregated data to answer user questions efficiently. The connector should expose tools that return derived metrics (e.g., cost per km, average fuel efficiency) rather than forcing the LLM to calculate them from raw records, which saves tokens and improves accuracy.

## Summary & Expected Outputs

- **Transport:** Streamable HTTP (via POST and GET/SSE).
- **Hosting:** Supabase Edge Functions (Deno).
- **Scope Model:** `vehicles:read`, `vehicles:write`, `logs:read`, `logs:write`, `analytics:read`.
- **Tool Manifest:** See Section 3 for the draft list.

### Follow-up Implementation Issues
1. Implement a custom OAuth 2.0 authorization flow to issue tokens to third-party AI agents.
2. Develop the baseline MCP Server Edge Function supporting Streamable HTTP.
3. Implement read-only MCP tools (`list_vehicles`, `get_vehicle_history`, `get_fuel_summary`).
4. Implement write-capable MCP tools (`log_refueling`, `log_service`, `log_expense`).
5. Update database schema to include `station_name`, `fuel_grade`, and `notes` on the `app.refuelings` table.