# Data Flow Architecture

## 1. Satellite Image Acquisition Flow

```text
Scheduler Trigger -> GEE API Request (Parallel query Sentinel-2, Landsat-8, Landsat-9)
-> First valid image response received -> Cancel other pending requests
-> Fetch required bands -> Store metadata in DB -> Save image payload to local temp storage
```

## 2. Marked Area Monitoring Flow

```text
Cron Job Trigger -> Query ACTIVE marked areas -> Check last scan timestamp
-> For each area due for scan -> Initiate Image Acquisition Flow
-> Local Processing Flow -> Save Scan Record -> Update Area Last Scan Date
```

## 3. Non-Marked Area Scanning Flow

```text
Weekly Cron Job -> Determine next small coordinate strip -> Initiate Image Acquisition Flow
-> Process strip -> If change detected -> Save potential Suspicious Area -> Alert generated
```

## 4. E-Pass Generation Flow

```text
User Request -> Validate Mining Authorization -> Check quantity limits
-> Validate Truck & Driver assignments -> Generate E-Pass payload -> Sign with Digital Signature / QR Code
-> Save E-Pass (ACTIVE) -> Return to User
```

## 5. Checkpoint Verification Flow (Online)

```text
Officer Scans QR Code -> API request to backend -> Validate E-Pass status (ACTIVE)
-> Return details to officer -> Officer confirms transport -> Update E-Pass to USED -> Log verification record
```

## 6. Checkpoint Verification Flow (Offline + Sync)

```text
Officer Scans QR Code Offline -> Local device app validates signature and timestamp
-> Officer confirms transport -> Save record locally as PENDING_SYNC -> Update local E-Pass state
-> (Later, when online) App syncs PENDING_SYNC records to backend -> Backend validates idempotent tokens
-> Update remote E-Pass to USED -> Return SYNCED status -> App marks local records SYNCED (or SYNC_FAILED on error)
```

## 7. Reconciliation Flow

```text
Daily/Weekly Cron -> Retrieve data: Satellite observed area change, Authorized limits, E-Pass totals, Checkpoint logs
-> Compare observations without converting metrics (do not equate hectares to tonnes directly)
-> Flag inconsistencies (e.g., Area change high but E-Passes low) -> Generate Recon Report -> Trigger Investigation Alerts if threshold exceeded
```
