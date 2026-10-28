# Development Credentials & Role-Based Access Control Reference

This document outlines the development credentials, roles, permissions, and module boundaries for the **Satellite Monitoring System** (`tn-forest-monitoring`).

---

## 1. Supported User Roles & Default Dev Accounts

The platform supports 7 canonical user roles defined in `@tn-forest/shared/types` (`UserRole`). All development accounts are pre-seeded with secure bcrypt-hashed passwords.

| Role (`UserRole`) | Email | Password | Employee ID | Display Name | Operational Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPER_ADMIN` | `superadmin@monitoring.system` | `SuperAdmin@2026!` | `EMP-0000` | System Super Administrator | Root authority across all system modules, configurations, user management, and system operations. |
| `ADMIN` | `admin@monitoring.system` | `Admin@Monitoring2026!` | `EMP-0002` | Operations Administrator | Platform manager overseeing users, monitored areas, monitoring cycles, alerts, cases, and logistics. |
| `FOREST_OFFICER` | `officer@monitoring.system` | `Officer@Monitoring2026!` | `EMP-0003` | Zonal Monitoring Officer | Environmental lead managing monitored areas, satellite catalogs, change detection, and investigation cases. |
| `MINING_OFFICER` | `mining.officer@monitoring.system` | `Mining@Monitoring2026!` | `EMP-0004` | Resource & Mining Officer | Resource regulator managing extraction authorizations, transit e-passes, and volumetric reconciliation. |
| `CHECKPOINT_OFFICER` | `checkpoint.officer@monitoring.system` | `Checkpoint@Monitoring2026!` | `EMP-0005` | Border Checkpoint Officer | Field officer performing QR-based transit e-pass verification at checkpoint weighbridges. |
| `FIELD_OFFICER` | `field.officer@monitoring.system` | `Field@Monitoring2026!` | `EMP-0006` | Field Verification Officer | Ground responder conducting on-site truth inspections, logging field findings, and updating alerts/cases. |
| `VIEWER` | `viewer@monitoring.system` | `Viewer@Monitoring2026!` | `EMP-0007` | Auditor & Analytics Viewer | Read-only access for compliance auditors, researchers, and statutory observers across all monitoring modules. |

### Legacy Backwards-Compatible Account
- **Email:** `admin@tnforest.gov.in`
- **Password:** `Admin@TNFMS2026!`
- **Role:** `SUPER_ADMIN`
- **Purpose:** Preserved for automated historical test suites and legacy script fixtures.

---

## 2. Role Permissions & Module Matrix

Role permissions are defined in `DEFAULT_ROLE_PERMISSIONS` in `@tn-forest/shared/constants` and enforced strictly on both client routes and backend APIs.

| Module / Resource | Path | `SUPER_ADMIN` | `ADMIN` | `FOREST_OFFICER` | `MINING_OFFICER` | `CHECKPOINT_OFFICER` | `FIELD_OFFICER` | `VIEWER` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dashboard** | `/` | Read/Write | Read/Write | Read/Write | Read/Write | Read/Write | Read/Write | Read-only |
| **User Administration** | `/users` | Full | Full | Read | Read | Read | Read | Read |
| **Monitored Areas** | `/areas` | Full | Full | Full | Read | — | Read | Read |
| **Satellite Catalog** | `/satellite` | Full | Full | Full | — | — | Read | Read |
| **Monitoring Jobs** | `/monitoring` | Full | Full | Full | — | — | Read | Read |
| **Baselines & Processing** | `/baselines` | Full | Full | Full | — | — | Read | Read |
| **Change Detection** | `/changes` | Full | Full | Full | — | — | Read | Read |
| **Offline Change Workstation** | `/offline-change-detection` | Full | Full | Full | — | — | Read | Read |
| **Incident Alerts** | `/alerts` | Full | Full | Full | Read | — | Read/Update | Read |
| **Enforcement Cases** | `/enforcement-cases` | Full | Full | Full | — | — | Read/Update | Read |
| **Permits & Mining** | `/mining-authorizations` | Full | Full | — | Full | — | — | — |
| **Transport Fleet** | `/vehicles`, `/drivers` | Full | Full | — | Full | Read | Read | — |
| **E-Passes** | `/epass` | Full | Full | — | Full | Read/Verify | — | — |
| **Checkpoints** | `/checkpoints` | Full | Full | — | — | Full | Read | — |
| **Reconciliation** | `/reconciliation` | Full | Full | Full | Full | — | — | Read |
| **Intelligence** | `/intelligence` | Full | Full | Full | Read | — | Read | Read |
| **Reports & Analytics** | `/reports` | Full | Full | Full | Read | — | Read | Read |

---

## 3. Security & Enforcement Architecture

### A. Backend RBAC Middleware
1. **Authentication:** All protected routes require a valid JWT bearer token verified via `requireAuth` (`server/src/middleware/authMiddleware.ts`).
2. **Permission Checks:** Endpoints enforce granular permissions using `requirePermission(Permission.XXX)` (`server/src/middleware/roleMiddleware.ts`).
   - If the user lacks the specific permission, the API immediately halts execution and returns:
     ```json
     {
       "success": false,
       "message": "Forbidden. Insufficient permissions."
     }
     ```
     with **HTTP 403 Forbidden**.
   - `SUPER_ADMIN` holds `*` permissions and bypasses checks.
3. **Password Security:** All passwords are automatically hashed with `bcryptjs` (cost factor 10) via `hashPassword()` in `server/src/utils/password.ts`. Plaintext passwords are never stored or logged.

### B. Client-Side Protection & UX
1. **Route Protection:** Protected routes are wrapped in `<ProtectedRoute requiredPermission={...} />` in `client/src/App.tsx`.
   - Unauthorized navigation immediately redirects the user to `/unauthorized` with an informative Access Denied screen.
2. **Dynamic Navigation:** The navigation sidebar (`client/src/components/layout/Sidebar.tsx`) inspects `user.permissions` and only renders menu groups and items the authenticated officer is authorized to access.
3. **Role Badges:** User roles are presented clearly in badges (`client/src/components/ui/RoleBadge.tsx`) with professional, generalized titles.

---

## 4. Seeding & Verification

### Automatic Seeding on Server Startup
The backend automatically invokes `seedDevUsers()` in `server/src/server.ts` upon startup. If accounts do not exist, they are created; if they already exist, their roles, permissions, and passwords are verified and synchronized idempotently.

### Standalone CLI Seeding
To manually seed or reset all development accounts:
```bash
cd server
npm run seed:dev-users
```

### Automated RBAC Verification Suite
To execute the automated 19-gate verification suite testing login, token retrieval, profile data, and RBAC boundary enforcement:
```bash
cd server
node ../node_modules/tsx/dist/cli.mjs src/tests/role-based-auth-verification.test.ts
```
