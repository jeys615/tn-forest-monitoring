# M1 — User & Access Management API Specification

## Base Path

`/api`

---

## 1. Authentication APIs

### 1.1 User Login

- **Endpoint**: `POST /api/auth/login`
- **Auth**: Public
- **Request Body**:
  ```json
  {
    "email": "admin@tnforest.gov.in",
    "password": "Admin@TNFMS2026!"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "60d5ec49b1c7c80015b6d5f0",
        "employeeId": "EMP-0001",
        "name": "System Super Administrator",
        "email": "admin@tnforest.gov.in",
        "phone": "+91 9444000000",
        "role": "SUPER_ADMIN",
        "permissions": ["USER_READ", "USER_CREATE", ...],
        "status": "ACTIVE",
        "lastLoginAt": "2026-08-20T01:20:00.000Z",
        "createdAt": "2026-08-20T01:20:00.000Z",
        "updatedAt": "2026-08-20T01:20:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": "1h"
    },
    "timestamp": "2026-08-20T01:20:00.000Z"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Invalid email or password / Inactive account
  - `403 Forbidden`: Account suspended

---

### 1.2 Get Current Authenticated User Profile

- **Endpoint**: `GET /api/auth/me`
- **Auth**: Required (`Authorization: Bearer <token>`)
- **Success Response (200 OK)**: Returns safe `UserDto`.
- **Error Responses**: `401 Unauthorized`

---

### 1.3 User Logout

- **Endpoint**: `POST /api/auth/logout`
- **Auth**: Required
- **Success Response (200 OK)**: Clears token context.

---

### 1.4 Change Password

- **Endpoint**: `POST /api/auth/change-password`
- **Auth**: Required
- **Request Body**:
  ```json
  {
    "currentPassword": "CurrentPass123!",
    "newPassword": "NewSecurePass123!"
  }
  ```
- **Success Response (200 OK)**

---

## 2. User Management APIs

### 2.1 List Users

- **Endpoint**: `GET /api/users?role=ADMIN&status=ACTIVE`
- **Auth**: Required (`Permission.USER_READ`)
- **Success Response (200 OK)**: Returns array of `UserDto`.

---

### 2.2 Get User by ID

- **Endpoint**: `GET /api/users/:id`
- **Auth**: Required (`Permission.USER_READ`)

---

### 2.3 Create User

- **Endpoint**: `POST /api/users`
- **Auth**: Required (`Permission.USER_CREATE`)
- **Request Body**:
  ```json
  {
    "employeeId": "EMP-0010",
    "name": "Officer Name",
    "email": "officer@tnforest.gov.in",
    "phone": "+91 9876543210",
    "password": "Password123!",
    "role": "FOREST_OFFICER",
    "permissions": ["USER_READ", "AREA_READ"]
  }
  ```
- **Error Responses**: `409 Conflict` (Duplicate email/employeeId), `403 Forbidden` (Privilege escalation attempt)

---

### 2.4 Update User

- **Endpoint**: `PATCH /api/users/:id`
- **Auth**: Required (`Permission.USER_UPDATE`)

---

### 2.5 Update User Status

- **Endpoint**: `PATCH /api/users/:id/status`
- **Auth**: Required (`Permission.USER_DEACTIVATE`)
- **Request Body**:
  ```json
  {
    "status": "INACTIVE"
  }
  ```
