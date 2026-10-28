# TN Forest Monitoring, Authorized Mining, E-Pass and Checkpoint Enforcement System

## Overview

A comprehensive system for monitoring forest/protected areas, authorized mining operations, and providing transport enforcement using E-Passes and checkpoints in Tamil Nadu.

## Technology Stack

| Layer          | Technology                      |
| -------------- | ------------------------------- |
| Frontend       | React, TypeScript, Vite         |
| Backend        | Node.js, Express.js, TypeScript |
| Database       | MongoDB, Mongoose               |
| Validation     | Zod                             |
| Authentication | JWT, bcryptjs                   |
| HTTP Client    | Axios                           |
| Routing        | React Router                    |

## Project Structure

```
tn-forest-monitoring/
├── client/          # React + Vite frontend
├── server/          # Express.js backend
├── shared/          # Shared types & constants
├── tests/           # Integration & E2E tests
├── docs/            # Project documentation
├── scripts/         # Utility scripts
├── .env.example     # Environment variable template
├── .gitignore       # Git ignore rules
├── .prettierrc      # Code formatting config
├── docker-compose.yml # Development services
├── package.json     # Root workspace config
└── README.md        # This file
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- MongoDB 7+ (local or Docker)
- npm 10+

### Setup

1. Clone the repository
2. Copy environment variables:
   ```bash
   cp .env.example server/.env
   ```
3. Update `server/.env` with your configuration
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start MongoDB (if using Docker):
   ```bash
   docker compose up -d mongodb
   ```

### Development

Start the backend:

```bash
npm run dev:server
```

Start the frontend:

```bash
npm run dev:client
```

### Build

```bash
npm run build
```

### Health Check

```
GET http://localhost:5000/api/health
```

## Modules

| Module | Name                              | Status      |
| ------ | --------------------------------- | ----------- |
| M1     | User & Access Management          | NOT_STARTED |
| M2     | Marked Area & Map Management      | NOT_STARTED |
| M3     | Multi-Satellite Image Acquisition | NOT_STARTED |
| M4     | Monitoring Scheduler              | NOT_STARTED |
| M5     | Local Image Processing            | NOT_STARTED |
| M6     | Change Detection & Classification | NOT_STARTED |
| M7     | Authorized Mining Monitoring      | NOT_STARTED |
| M8     | Alert & Field Verification        | NOT_STARTED |
| M9     | Transport & E-Pass Management     | NOT_STARTED |
| M10    | Checkpoint Enforcement            | NOT_STARTED |
| M11    | Mining & Transport Reconciliation | NOT_STARTED |
| M12    | Reports, Evidence & Audit         | NOT_STARTED |

## Architecture

See [docs/architecture/](docs/architecture/) for detailed architecture documentation.

## License

Proprietary — All rights reserved.
