# Module M9: Transport & E-Pass Management

## 1. Overview & Objective

Module M9 manages the full lifecycle of mineral transit permissions, digital transport authorization passes (E-Passes), commercial transport companies, registered heavy haulage vehicles, and verified commercial drivers.

It provides tamper-evident digital trip authorizations containing canonical JSON payloads, SHA-256 integrity hashes, and cryptographic HMAC-SHA256 digital signatures that can be offline-verified at forest boundary checkpoints without exposing private signing keys.

---

## 2. Core Separation of Concerns (Rule 23)

In accordance with strict system invariants (**Rule 23**):
> **"Satellite area/hectares and transport tonnes MUST remain separate metrics. Do not create any false relationship claiming: satellite area = transported tonnes."**

- **Satellite Image & Radar Remote Sensing:** Measures spectral indices (NDVI, NDWI, NBR), radar backscatter ($\gamma^0_{VH}$, $\gamma^0_{VV}$), and spatial disturbance footprint in hectares ($ha$).
- **Transport & Logistics Enforcement:** Measures physical mass in metric tonnes ($t$), permitted vehicle tare/gross weights, individual trip quotas, and checkpoint transit logs.
- The two metrics are stored in separate models and never conflated into an artificial algebraic equivalence.

---

## 3. Architecture & Data Flow

```
+-------------------------------------------------------------+
|              Mining Authorization (Permit Quota)            |
|   Permitted: 10,000 Tonnes | Remaining: 9,980 Tonnes        |
+------------------------------+------------------------------+
                               |
                               | Atomic Quota Deduction
                               v
+-------------------------------------------------------------+
|                     E-Pass Generator                        |
|  - Validates Permit Validity & Active Status                |
|  - Validates Vehicle Tare, GVW & Max Payload Capacity       |
|  - Validates Driver Commercial License & Verified Status    |
|  - Reserves Quota Atomically via $inc: -netWeightTonnes    |
|  - Generates Unique Pass ID: EP-YYYY-XXXXXXXX               |
|  - Generates Canonical Payload + SHA-256 Hash + HMAC-SHA256 |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                    Digital Transit E-Pass                   |
|  Status: ACTIVE -> Checkpoint Verification -> USED          |
|  (Or CANCELLED by Officer -> Quota Atomically Restored)     |
+-------------------------------------------------------------+
```

---

## 4. Cryptographic QR Payload & Digital Signature

Each generated E-Pass embeds a canonical JSON object:
```json
{
  "p": "EP-2026-A1B2C3D4",
  "a": "AUTH-2026-9081",
  "v": "TN-38-BZ-4412",
  "d": "TN-38-2018-0094123",
  "m": "Granite",
  "w": 25.0,
  "f": "2026-08-25T09:00:00.000Z",
  "u": "2026-08-26T09:00:00.000Z",
  "c": "Walayar Checkpoint #1",
  "h": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sig": "f8a7d32c918e..."
}
```

### Signature Verification:
1. Extract canonical string excluding the signature.
2. Compute `crypto.createHmac('sha256', SECRET).update(payload).digest('hex')`.
3. Use `crypto.timingSafeEqual` to verify signature equality without timing attacks.

---

## 5. MongoDB Models

1. `MiningAuthorization`: Permit numbers, lessees, authorized volumes/tonnages, validity windows, and atomic remaining quota.
2. `TransportCompany`: Fleet operators, registration details, compliance status.
3. `Vehicle`: Registration numbers, vehicle types, tare weight, gross vehicle weight (GVW), permitted carrying capacity, GPS telemetry unit identifiers.
4. `Driver`: Commercial driving license numbers, contact details, verification statuses (`VERIFIED`, `PENDING`, `REJECTED`, `SUSPENDED`).
5. `EPass`: Pass numbers, references, mineral weight, canonical QR payload, QR hash, HMAC-SHA256 signature, lifecycle status (`DRAFT`, `ACTIVE`, `USED`, `EXPIRED`, `CANCELLED`, `REVOKED`), dispatch/used timestamps.

---

## 6. Verification & Automated Test Coverage

- **Suite File:** `server/src/tests/m9-transport-epass.test.ts`
- **Assertions:** 27 / 27 Automated Assertions Passed
- **Master Regression Suite:** 17 Suites / 17 Suites Passed (449 total assertions)
- **TypeScript:** 0 errors
- **ESLint:** 0 errors
- **Client Build:** Pass
