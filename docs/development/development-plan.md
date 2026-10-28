# Development Plan

## Overview

This document outlines the structured development plan for the TN Forest Monitoring System.

## Development Order

Modules must be built in this strict sequence:

1. M1 — User & Access Management
2. M2 — Marked Area & Map Management
3. M3 — Multi-Satellite Image Acquisition
4. M4 — Monitoring Scheduler
5. M5 — Local Image Processing
6. M6 — Change Detection & Classification
7. M7 — Authorized Mining Monitoring
8. M9 — Transport & E-Pass Management
9. M10 — Checkpoint Enforcement
10. M11 — Mining & Transport Reconciliation
11. M8 — Alert & Field Verification
12. M12 — Reports, Evidence & Audit

_Rule: Each module must be completely implemented and tested before moving to the next._

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express.js, TypeScript (ESM)
- **Database**: MongoDB 7+, Mongoose
- **Validation**: Zod
- **Authentication**: JWT, bcryptjs

## Architecture Patterns

- **Frontend**: Feature-based modular architecture.
- **Backend**: Layered architecture (Routes -> Middleware -> Controllers -> Services -> Repositories -> Models).
- **Data**: No database operations in controllers; validation at the boundary using Zod.

## Testing Strategy

- Unit tests for Services and Repositories.
- Integration tests for API endpoints.
- Component tests for shared UI elements in React.
- E2E testing strategy (to be defined before final release).
