# Diagram Index: Editable Draw.io Technical Diagrams

**Project:** Tamil Nadu Forest Monitoring System (TNFMS)  
**Source Document:** [`TN_Forest_Monitoring_System_Mini_Project_Report.docx`](../TN_Forest_Monitoring_System_Mini_Project_Report.docx)  
**Output Directory:** `D:\tn-enforcement-system\tn-forest-monitoring\docs\drawio_diagrams\`  
**Format Specification:** Native Draw.io / diagrams.net XML format (`.drawio`), 100% monochrome / black-and-white (black lines, black text, white-filled shapes, zero colour gradients or shadows), fully editable vector nodes and orthogonal connectors.

---

## 1. Core Technical Diagrams Extracted from the Project Report

The following 5 technical illustrations are embedded in **Chapter 3 (System Design)** of the Mini Project Report and have been recreated as native, editable `.drawio` files:

| # | Figure in Report | Diagram Title | Report Location | Draw.io Filename | Diagram Type |
|---|---|---|---|---|---|
| 1 | **Figure 3.1** | Multi-Tier System Architecture Diagram | Chapter 3, Section 3.2, Page 12 | [`system_architecture.drawio`](./system_architecture.drawio) | Multi-Tier System Architecture |
| 2 | **Figure 3.2** | Online GEE-Backed Satellite Monitoring Pipeline | Chapter 3, Section 3.6, Page 18 | [`online_gee_monitoring_pipeline.drawio`](./online_gee_monitoring_pipeline.drawio) | Sequential Workflow / Flowchart |
| 3 | **Figure 3.3** | Offline Satellite Image Change Detection Workstation Pipeline | Chapter 3, Section 3.7, Page 20 | [`offline_change_detection_pipeline.drawio`](./offline_change_detection_pipeline.drawio) | Sequential Processing Pipeline |
| 4 | **Figure 3.4** | Data Flow Diagram (DFD Level 1) | Chapter 3, Section 3.10, Page 25 | [`data_flow_diagram_level_1.drawio`](./data_flow_diagram_level_1.drawio) | Data Flow Diagram (DFD Level 1) |
| 5 | **Figure 3.5** | MongoDB Document Schema Model & Entity Relationships | Chapter 3, Section 3.4, Page 14 | [`mongodb_er_diagram.drawio`](./mongodb_er_diagram.drawio) | Entity-Relationship / Document ODM Schema |

---

## 2. Supplementary UML Activity Diagrams

In addition to the 5 core report figures, the project includes 4 complete UML Activity Diagrams detailing the end-to-end enforcement and monitoring workflows. These have also been converted to strict black-and-white, editable `.drawio` format:

| # | Workflow Domain | Diagram Title | Draw.io Filename | Diagram Type |
|---|---|---|---|---|
| 6 | Satellite Monitoring & Alerting | UML Activity Diagram: Automated Satellite Monitoring, Multi-Sensor Change Detection & Alert Generation | [`activity_diagram_satellite_monitoring.drawio`](./activity_diagram_satellite_monitoring.drawio) | UML Activity Diagram (Swimlane) |
| 7 | Mineral & Timber Transport | UML Activity Diagram: Mineral & Timber Transit E-Pass Issuance & Quota Tracking | [`activity_diagram_epass_issuance.drawio`](./activity_diagram_epass_issuance.drawio) | UML Activity Diagram (Swimlane) |
| 8 | Checkpoint Verification | UML Activity Diagram: Field Checkpoint Verification, Weighbridge Mass Inspection & Interception | [`activity_diagram_checkpoint_enforcement.drawio`](./activity_diagram_checkpoint_enforcement.drawio) | UML Activity Diagram (Swimlane) |
| 9 | Mass & Quota Reconciliation | UML Activity Diagram: Transport Mass Reconciliation & Investigation Case Generation | [`activity_diagram_reconciliation_investigation.drawio`](./activity_diagram_reconciliation_investigation.drawio) | UML Activity Diagram (Swimlane) |

---

## 3. Diagram Details & Functional Scope

### 3.1 `system_architecture.drawio` (Figure 3.1)
- **Report Reference:** Chapter 3, Section 3.2, Paragraph 215, Page 12.
- **Layers Documented:**
  - **Tier 1 (Presentation):** React 18, TypeScript, Vite, Tailwind CSS with 5 functional client workspaces (Executive Dashboard, Marked Area GIS, Monitoring Control, Offline Workstation, Enforcement & E-Pass).
  - **API Gateway:** Express.js REST API with short-lived JWT authentication, RBAC permission middleware, Zod schema validation, and Busboy streaming multipart file upload handling.
  - **Tier 2 (Domain Services):** 8 modular backend services (Auth & RBAC, Zone & Area, GEE Acquisition, Monitoring Scheduler, Detection Pipeline v2.0, Offline Raster Engine, Alert & Enforcement, Compliance & E-Pass).
  - **Tier 3 (Data & Computation):** MongoDB 7+ (Mongoose ODM, 2dsphere indexes), Google Earth Engine Cloud API, and Local Filesystem Raster Storage.

### 3.2 `online_gee_monitoring_pipeline.drawio` (Figure 3.2)
- **Report Reference:** Chapter 3, Section 3.6, Paragraph 243, Page 18.
- **Workflow Steps (1 to 9):**
  1. Scheduled Trigger (Cadence Worker, 1–30 day intervals)
  2. GEE Ingestion (Sentinel-2 L2A MultiSource Provider, access token validation)
  3. SCL Cloud Filter (Mask cloud, cloud shadow, cirrus; threshold scene cloud < 20%)
  4. Baseline Matching (Fetch active baseline raster for zone boundary)
  5. Spatial Alignment (Resample to common 10m grid in EPSG:32643 UTM)
  6. Algorithm v2.0 (Official classification authority: $\Delta\text{NDVI} = \text{NDVI}_{T1} - \text{NDVI}_{T0} \le -0.15$)
  7. Canopy Guard v2.1 ([SHADOW MODE] Calculates confidence score without active gating)
  8. Polygon Vectorization (Cluster contiguous loss pixels, filter minimum size, compute hectares)
  9. Evidence & Alert (Generate ChangeDetection record, dispatch alerts, export GeoJSON/KML dossier)

### 3.3 `offline_change_detection_pipeline.drawio` (Figure 3.3)
- **Report Reference:** Chapter 3, Section 3.7, Paragraph 256, Page 20.
- **Processing Stages (1 to 9):**
  1. Dual Image Selection (Local GeoTIFF pickers: T0 baseline & T1 observation)
  2. Sensor & Metadata Inspection (Heuristic CRS, pixel dimensions, affine georeferencing)
  3. Reflectance Calibration (Sentinel-2 L2A DN $\times 0.0001$, Landsat C2 L2 DN $\times 0.0000275 - 0.2$)
  4. SCL & QA Cloud Masking (Classes 0, 1, 3, 8, 9, 10, 11; masked as UNCERTAIN)
  5. Spatial & Sensor Harmonization (Common analysis grid alignment, Roy et al. bandpass harmonization)
  6. Dual Spectral Index Engine ($\Delta\text{NDVI}$ and $\Delta\text{BSI}$ calculations)
  7. 7-Class Categorical Engine (Veg Decrease, Veg Increase, Bare-Soil Expansion, Bare-Soil Reduction, Other Spectral, Stable, Uncertain)
  8. Metric Area Accounting (Geodesic/Projected area calculation; total area strictly conserved)
  9. Scientific Export Center (Categorical TIFF, $\Delta\text{NDVI}$ TIFF, PNG maps, CSV tables, JSON metadata, Markdown reports)

### 3.4 `data_flow_diagram_level_1.drawio` (Figure 3.4)
- **Report Reference:** Chapter 3, Section 3.10, Paragraph 288, Page 25.
- **Entities, Processes & Stores:**
  - **External Entities:** Forest Officer / Administrator, Checkpoint Officer / Enforcement Beat, Satellite Source (GEE / Sentinel-2 / Landsat-8).
  - **Processes (1.0 to 5.0):** 1.0 Manage Zones & Baselines, 2.0 Satellite Change Detection Engine, 3.0 Generate Alerts & Evidence Dossiers, 4.0 Checkpoint & E-Pass Verification, 5.0 Reconciliation & Reports.
  - **Data Stores:** D1: Zones & Baselines Store, D2: Change Detections & Alerts Store, D3: Transit E-Passes & Weighbridge Logs.
  - **Data Flows:** 12 orthogonal, labeled connectors mapping data exchange between entities, processes, and persistent collections.

### 3.5 `mongodb_er_diagram.drawio` (Figure 3.5)
- **Report Reference:** Chapter 3, Section 3.4, Paragraph 228, Page 14.
- **Collections & Schemas Documented:**
  - `Zone` (`zones`) — Boundaries, 2dsphere index, cadence, category, area.
  - `Baseline` (`baselines`) — Zone reference, satellite scene reference, acquisition date, raster path.
  - `SatelliteMetadata` (`satellitemetadatas`) — Scene ID, sensor, cloud cover, footprint.
  - `ChangeDetection` (`changedetections`) — Changed pixels, hectare loss, polygons, algorithm version.
  - `Alert` (`alerts`) — Severity, status, assigned officer, Form 1 observations, dossier path.
  - `MonitoringJob` (`monitoringjobs`) — Job status, queue state, execution trace logs, timeout.
  - `User` (`users`) — Role-based accounts (7 roles), hashed credentials, permission flags.
  - `EPass` (`epasses`) — Transit pass ID, vehicle registration, mineral type, authorized weight.
  - `CheckpointLog` (`checkpointlogs`) — Measured weighbridge weight, discrepancy, verification outcome.
- **Relationships:** Cardinality notation ($1:N$, $N:1$, $1:0..1$) and foreign key references.

---

## 4. Preserved Application Screenshots (Unmodified)

In strict accordance with Requirement 5, all live application user interface captures and satellite data exhibits have been **preserved without modification** in the original Word document:

| Figure in Report | Caption / Subject | Classification | Status |
|---|---|---|---|
| **Figure 5.1** | Real-Raster Before-and-After Sentinel-2 Image Comparison Exhibit | Satellite Raster Exhibit | Preserved (Unchanged) |
| **Figure 5.2** | Multi-Temporal NDVI Spatial Distribution & Difference Analysis | Satellite Raster Exhibit | Preserved (Unchanged) |
| **Figure 5.3** | Live Offline Satellite Change Detection Workstation Interface | Live UI Screenshot | Preserved (Unchanged) |
| **Figure 5.4** | Offline Change Detection Categorical Map (57,468 ha Scene) | Satellite Raster Exhibit | Preserved (Unchanged) |
| **Figure 5.5** | Scene Classification Layer (SCL) Cloud and Shadow Masking Map | Satellite Raster Exhibit | Preserved (Unchanged) |
| **Figure 5.6** | Executive Dashboard and Active Monitoring Status | Live UI Screenshot | Preserved (Unchanged) |
| **Figure 5.7** | Interactive Marked-Area GIS Management Map | Live UI Screenshot | Preserved (Unchanged) |
| **Figure 5.8** | Roadway Checkpoint Enforcement & E-Pass Verification Console | Live UI Screenshot | Preserved (Unchanged) |

---

## 5. Verification & Compliance Checklist

- [x] **File Format:** All diagrams are genuine XML `.drawio` files compatible with diagrams.net / draw.io desktop and web apps.
- [x] **Monochrome Requirement:** 100% black lines (`#000000`), black text (`#000000`), and white backgrounds (`#ffffff`), with zero colour fills or gradients.
- [x] **Terminology & Structure:** Exactly matches the labels, equations, algorithm versions, schemas, and fields of the source report.
- [x] **Non-Destructive Execution:** The original Word report (`TN_Forest_Monitoring_System_Mini_Project_Report.docx`) remains completely untouched.
