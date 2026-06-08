# MCP Cloud Connector Design: Literature Survey and Architecture

This document explores the architectural requirements and best practices for exposing Crunch My Car as a remote Model Context Protocol (MCP) server. By doing so, AI agents can interact securely with users' vehicle data, transforming the app into an active cloud connector.

## 1. MCP Server Requirements
### Transport Mechanism
- A remote (cloud-hosted) MCP server must expose either **HTTP with Server-Sent Events (SSE)** or **Streamable HTTP** endpoints. Local MCP servers typically communicate over standard I/O (stdio).
- **Recommendation:** Implement the standard Streamable HTTP transport (from the June 2025 MCP specification) because it is widely supported by modern MCP clients and enables efficient, bidirectional, asynchronous communication without the persistent connection overhead of pure WebSockets. It also includes session management via headers and supports resumability.

### Hosting Options Compatible with the Stack
- The current application is built with React/Vite (frontend) and Supabase (PostgreSQL, Auth).
- **Recommendation:** Use **Supabase Edge Functions** (Deno) to host the MCP server endpoints. They are natively integrated with the existing backend, offer low latency, scale automatically, and support SSE and HTTP streaming APIs easily out of the box.

## 2. Authentication & Authorisation
### OAuth 2.0 Integration
- MCP cloud connectors must use OAuth 2.0 to securely authenticate third-party AI agents on behalf of users.
- **Current Setup:** The app currently relies on Supabase Auth (mostly JWT-based frontend sessions).
- **Required Changes:** To support third-party delegation, we need an OAuth 2.0 authorization server setup. While Supabase Auth handles user identity, it doesn't natively act as an OAuth 2.0 *provider* that issues tokens to third-party clients (agents). We will need to implement a lightweight OAuth authorization flow—potentially via a dedicated Edge Function or a specialized library in Deno—that can issue, validate, and revoke access tokens, mapping them to the underlying Supabase User ID.

### Proposed Scope Model
Granular scopes are crucial for security. Proposed scopes:
- `vehicles:read` - View cars and high-level stats.
- `refuelings:read`, `refuelings:write` - View and log fuel fill-ups.
- `services:read`, `services:write` - View and log maintenance.
- `expenses:read`, `expenses:write` - View and log general expenses.

## 3. Tool Surface Design
### Candidates for MCP Tools
The following operations will be exposed as discrete tools in the MCP manifest:

- **Read-Only:**
  - `list_vehicles`: Retrieve the user's cars and basic metadata.
  - `get_vehicle_history`: Retrieve unified timeline of events (fuel, service, expenses).
  - `get_vehicle_stats`: Fetch aggregated metrics (cost, fuel efficiency).
  - `get_fuel_summary`: Summarized fueling history and trends.

- **Write-Capable:**
  - `log_refueling`: Add a fuel record. *Input:* Car ID, Date, Odometer, Volume, Total Cost.
  - `log_service`: Add a maintenance record. *Input:* Car ID, Date, Odometer, Description, Total Cost.
  - `log_expense`: Add a general expense. *Input:* Car ID, Date, Amount, Description, Category.

### Risk and Safety Considerations
- **No Deletions/Updates Initially:** Tools should strictly be append-only (`log_*`) and read-only (`get_*`). Modifying or deleting existing records should require the user to use the GUI.
- **Confirmation:** AI clients should be designed to ask for user confirmation before executing write tools, although this is largely handled client-side. The server should validate inputs strictly.

## 4. API / Data Access Layer
### Connecting to Supabase
- Currently, the frontend accesses the database directly via Supabase JS with user-scoped JWTs.
- **For MCP:** The MCP server (Edge Function) will handle incoming requests with OAuth tokens.
- **RLS Integration:** The Edge Function must exchange the validated OAuth token for a standard Supabase user context, or use the Supabase Service Role key combined with explicit `set_config('request.jwt.claims', ...)` to impersonate the user. This ensures that all existing Row Level Security (RLS) policies automatically apply to agent-originated requests without rewriting security rules.

## 5. Schema & Capability Gaps
### Current Schema Limitations
- The current schema (`cars`, `refuelings`, `services`, `expenses`) captures basic quantitative data but lacks unstructured metadata that LLMs often excel at parsing.

### Recommended Additions
- **Notes Field:** Add an optional `notes` (TEXT) column to all log tables (`refuelings`, `services`, `expenses`) so agents can record anecdotal context provided by the user (e.g., "Car felt sluggish before oil change" or "Station was out of premium fuel").
- **Location Data:** Add `station_name` or `location` to `refuelings`.
- **Fuel Metadata:** Add `fuel_grade` or `fuel_type` (e.g., Unleaded 95, Diesel) to `refuelings`.
- **Derived Data:** The MCP connector *should* expose derived data (cost per km, average fuel efficiency). The current database already has RPCs (`app.get_vehicle_stats`, `app.get_fuel_efficiency_trend`) that should be wrapped and exposed via MCP tools, allowing agents to answer complex analytical questions instantly without calculating it themselves from raw records.

## Summary of Decisions
- **Transport:** Streamable HTTP (June 2025 spec).
- **Hosting Target:** Supabase Edge Functions.
- **Auth:** Implement lightweight OAuth 2.0 flow mapping to Supabase Auth.
- **Database Access:** Supabase client impersonating user via RLS.
