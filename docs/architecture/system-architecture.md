# System Architecture

## Overview

The TN Forest Monitoring, Authorized Mining, E-Pass and Checkpoint Enforcement System is a comprehensive platform for monitoring forest/protected areas, authorized mining operations, and transport enforcement in Tamil Nadu.

## Technology Stack

| Component        | Technology                      |
| ---------------- | ------------------------------- |
| Frontend         | React 18, TypeScript, Vite      |
| Backend          | Node.js, Express.js, TypeScript |
| Database         | MongoDB 7+, Mongoose            |
| Validation       | Zod                             |
| Authentication   | JWT, bcryptjs                   |
| HTTP Client      | Axios                           |
| Routing          | React Router v7                 |
| Containerization | Docker, Docker Compose          |

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                  CLIENT                      │
│          React + TypeScript + Vite           │
│     Feature-based modular architecture       │
├─────────────────────────────────────────────┤
│                  API (HTTP)                  │
│               Axios + REST                   │
├─────────────────────────────────────────────┤
│                  SERVER                      │
│       Express.js + TypeScript                │
│  Route → Middleware → Controller → Service   │
│            → Repository → Model              │
├─────────────────────────────────────────────┤
│                 DATABASE                     │
│            MongoDB + Mongoose                │
└─────────────────────────────────────────────┘
```

## Backend Architecture

The backend follows a layered architecture:

```
Route
 ↓
Middleware (auth, validation, logging)
 ↓
Controller (request/response handling)
 ↓
Service (business logic)
 ↓
Repository (data access)
 ↓
Mongoose Model
 ↓
MongoDB
```

### Layer Responsibilities

- **Routes**: Define API endpoints and attach middleware
- **Middleware**: Cross-cutting concerns (auth, validation, logging, error handling)
- **Controllers**: Handle HTTP request/response, delegate to services
- **Services**: Business logic, orchestration
- **Repositories**: Database operations, query building
- **Models**: Mongoose schemas, data validation

### Rules

- No database queries in controllers
- No business logic in routes
- Centralized error handling
- Request validation via Zod
- Environment-based configuration with Zod validation

## Frontend Architecture

Feature-based organization:

```
client/src/
├── components/     # Shared UI components
│   ├── common/     # Generic reusable components
│   ├── layout/     # App layout (header, sidebar)
│   └── ui/         # UI primitives
├── features/       # Feature modules (one per business module)
│   ├── auth/
│   ├── users/
│   ├── areas/
│   └── ...         # One directory per module
├── pages/          # Route-level page components
├── hooks/          # Shared React hooks
├── context/        # React context providers
├── services/       # API service layer
├── types/          # Shared TypeScript types
├── utils/          # Utility functions
├── constants/      # Application constants
└── config/         # App configuration
```

## GEE Integration Architecture (Future)

Google Earth Engine is used ONLY as an image source. All computation is local.

```
Monitoring Scheduler
        ↓
Multi-Satellite GEE Search (parallel)
        ↓
First Valid Image
        ↓
Retrieve Required Image/Bands
        ↓
LOCAL SYSTEM
        ↓
Image Processing
        ↓
Change Detection
        ↓
Mining/Alert Results
```

## Multi-Satellite Acquisition (Future)

When an image is required, query all configured satellites concurrently:

```
             IMAGE REQUIRED
                    |
          +---------+---------+
          |         |         |
          v         v         v
     Sentinel-2  Landsat-8  Landsat-9
          |         |         |
          +---------+---------+
                    |
                    v
             FIRST VALID IMAGE
                    |
                    v
                DOWNLOAD
                    |
                    v
            LOCAL PROCESSING
```

Do NOT query satellites sequentially. Accept the FIRST VALID image.

## Satellite Storage Strategy (Future)

Store metadata only:

- imageId, GEE image ID, collection ID
- satellite/source, acquisition date/time
- cloud percentage, footprint
- available bands, metadata

Do NOT permanently store large satellite imagery locally.

## Security Architecture

- Environment variables for secrets (never hardcoded)
- JWT-based authentication
- Role-based access control (RBAC)
- Helmet for HTTP security headers
- CORS configuration
- Centralized error handling (no stack traces in production)
- Zod validation on all inputs
- Secure password hashing with bcryptjs

## Deployment Architecture

```
┌──────────────────────────────┐
│     Docker Compose (Dev)     │
├──────────────────────────────┤
│  MongoDB 7                   │
│  (Optional Redis — future)   │
└──────────────────────────────┘

Frontend: Vite dev server (port 5173)
Backend: Express server (port 5000)
Database: MongoDB (port 27017)
```
