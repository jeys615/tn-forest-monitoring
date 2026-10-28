# Database Architecture & Design

## Database Engine

- **Database**: MongoDB 7+
- **ODM**: Mongoose 8+
- **Connection URI**: `mongodb://localhost:27017/tn_forest_monitoring`

## Strategy

- Models are defined incrementally per module.
- Strict schema validation, normalized field values, and indexing.
- Soft-deletion and status-based archival (no destructive hard deletes for historical continuity).

---

## Module M1 Schemas

### User Collection (`users`)

```typescript
interface IUser {
  _id: ObjectId;
  employeeId?: string; // Unique, sparse index
  name: string;
  email: string; // Unique, lowercase, indexed
  phone?: string;
  passwordHash: string; // select: false
  role: UserRole; // SUPER_ADMIN, ADMIN, FOREST_OFFICER, MINING_OFFICER, CHECKPOINT_OFFICER, FIELD_OFFICER, VIEWER
  permissions: string[]; // Array of Permission strings
  status: UserStatus; // ACTIVE, INACTIVE, SUSPENDED (indexed)
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes

1. `email` (Unique, Ascending)
2. `employeeId` (Unique, Sparse)
3. `status` (Ascending)
