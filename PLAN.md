# Crunch My Car: Project Implementation Plan

This document outlines the structured roadmap for building the "Crunch My Car" application. The project is divided into logical phases, ensuring a stable foundation before moving to user-facing features.

---

## Phase 1: Backend Foundation (COMPLETED)
Focus: Database schema, security policies, and manual verification.
- [x] Design core schema (Cars, Refuelings, Services, Expenses).
- [x] Implement database migrations.
- [x] Enable Row Level Security (RLS) for all tables.
- [x] Implement multi-user data isolation policies.
- [x] Verify security via bidirectional pgTAP unit tests.

## Phase 2: Frontend Foundation (COMPLETED)
Focus: Tech stack selection and architectural patterns.
- [x] **Task 2.1: Tech Stack Selection**
    - Selected React (Vite) and Tailwind CSS for the frontend prototype.
- [x] **Task 2.2: Architecture Design**
    - Defined multi-environment strategy (Dev, Staging, Production).
    - Established directory structure and secure Supabase client patterns.

## Phase 3: Infrastructure & Automation (IN PROGRESS)
Focus: Developer experience, type safety, and CI/CD.
- [x] **Task 3.1: Automated Testing & Deployment Pipeline**
    - Finalized GitHub Actions for database unit tests and automated migrations (Staging/Production).
- [ ] **Task 3.2: TypeScript Type Generation**
    - Generate types from the live schema to enable frontend type safety.
- [ ] **Task 3.3: Unified Timeline View**
    - Create a database `VIEW` that combines refuelings, services, and expenses.
- [ ] **Task 3.4: Vercel Integration & Hosting**
    - Link the project to Vercel for automated frontend deployments.
    - Configure staging and production environments on Vercel.


## Phase 4: Advanced Backend Features
Focus: Analytics and performance optimization.
- [x] **Task 4.1: Analytics Engine (RPCs)**
    - Implement Postgres functions (RPCs) for metrics.
- [x] **Task 4.2: Performance Indexing**
    - Add B-tree indexes for optimized scaling.

## Phase 5: Frontend Development (Prototype)
Focus: User interface and API integration.
- [x] **Task 5.1: Authentication Flow**
- [ ] **Task 5.2: Vehicle Management**
- [ ] **Task 5.3: Logging Interface**
- [ ] **Task 5.4: Timeline & Analytics Dashboard**

## Phase 6: Polish & Deployment
Focus: Readiness for production.
- [ ] Final security audit.
- [ ] Mobile-responsive UI polish.
- [ ] Deployment documentation.

## Phase 7: MCP Cloud Connector Implementation
Focus: Exposing the application to AI agents.
- [ ] **Task 7.1: Enable Supabase OAuth 2.1 Server**
    - Configure `supabase/config.toml` to enable the OAuth server.
    - Define and register the application with the local/remote Supabase instances.
- [ ] **Task 7.2: Implement MCP Edge Function**
    - Create a new Edge Function `mcp-connector` using `@modelcontextprotocol/sdk`.
    - Implement the Streamable HTTP transport.
- [ ] **Task 7.3: Implement MCP Tools**
    - Map database RPCs and table operations to MCP tools.
    - Implement `list_vehicles`, `get_vehicle_stats`, and `log_refueling`.
- [ ] **Task 7.4: Integration Testing**
    - Verify the MCP connector using the MCP Inspector or a real agent client.

---

## Current Status
**Currently at:** Phase 5 (Frontend Development).
**Next Step:** Execute Task 5.4 (Timeline & Analytics Dashboard).

