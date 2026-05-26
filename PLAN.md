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

## Phase 2: Frontend Foundation
Focus: Tech stack selection and architectural patterns.
- [ ] **Task 2.1: Tech Stack Selection**
    - Decide on the frontend framework (e.g., Next.js, React Native, or Flutter) based on the "Drivvo" inspiration.
    - Select styling and UI component libraries.
- [ ] **Task 2.2: Architecture Design**
    - Define state management strategy (e.g., React Query, Zustand, or built-in Supabase hooks).
    - Establish directory structure and routing patterns.

## Phase 3: Infrastructure & Automation
Focus: Developer experience, type safety, and CI/CD.
- [ ] **Task 3.1: Automated Testing Pipeline**
    - Finalize and test the GitHub Actions workflow for database unit tests.
- [ ] **Task 3.2: TypeScript Type Generation**
    - Generate types from the live schema to enable frontend type safety.
- [ ] **Task 3.3: Unified Timeline View**
    - Create a database `VIEW` that combines refuelings, services, and expenses.

## Phase 4: Advanced Backend Features
Focus: Analytics and performance optimization.
- [ ] **Task 4.1: Analytics Engine (RPCs)**
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

---

## Current Status
**Currently at:** Start of Phase 2 (Frontend Foundation).
**Next Step:** Execute Task 2.1 (Tech Stack Selection).
