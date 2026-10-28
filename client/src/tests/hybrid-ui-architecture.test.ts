/**
 * HYBRID UI ARCHITECTURE & DATA ISOLATION TEST SUITE
 *
 * Verifies:
 * 1. Exactly 5 modules use ZoneWorkspaceDirectory (Folder-Style entry experience)
 * 2. All 9+ business modules retain specialized enterprise UI (NO ZoneWorkspaceDirectory)
 * 3. Strict data isolation across the 5 monitoring workspace modules
 * 4. MainLayout fixed sidebar architecture (100vh, overflow: hidden, independent scrolling)
 * 5. Deep-linking / URL routing preservation (?zoneId=...)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Module file definitions
const CLIENT_SRC = path.resolve(__dirname, '..');

const FOLDER_MODULE_FILES = [
  'pages/areas/AreasPage.tsx',
  'pages/satellite/SatellitePage.tsx',
  'pages/monitoring/MonitoringPage.tsx',
  'pages/baselines/BaselinePage.tsx',
  'pages/changes/ChangesPage.tsx',
];

const NON_FOLDER_MODULE_FILES = [
  'pages/alerts/AlertsPage.tsx',
  'pages/mining/MiningAuthorizationPage.tsx',
  'pages/fleet/VehicleRegistryPage.tsx',
  'pages/fleet/DriverRegistryPage.tsx',
  'pages/epass/EPassPage.tsx',
  'pages/checkpoint/CheckpointEnforcementPage.tsx',
  'pages/reconciliation/ReconciliationPage.tsx',
  'pages/reports/ReportsPage.tsx',
  'pages/enforcement/EnforcementCasePage.tsx',
  'pages/intelligence/IntelligenceDashboardPage.tsx',
];

describe('Hybrid UI Architecture & Strict Data Isolation', () => {
  // ─── GATE 1: Exactly 5 folder modules retain ZoneWorkspaceDirectory ───────
  it('Gate 1: Exactly the 5 approved modules use ZoneWorkspaceDirectory', () => {
    for (const relPath of FOLDER_MODULE_FILES) {
      const fullPath = path.join(CLIENT_SRC, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).toContain('ZoneWorkspaceDirectory');
    }
  });

  // ─── GATE 2: All non-folder modules do NOT use ZoneWorkspaceDirectory ─────
  it('Gate 2: Non-folder business modules do NOT render ZoneWorkspaceDirectory', () => {
    for (const relPath of NON_FOLDER_MODULE_FILES) {
      const fullPath = path.join(CLIENT_SRC, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).not.toContain('<ZoneWorkspaceDirectory');
      expect(content).not.toContain('import { ZoneWorkspaceDirectory }');
    }
  });

  // ─── GATE 3: Monitoring Areas strict data isolation ───────────────────────
  it('Gate 3: Monitoring Areas page displays only cadastral data, no foreign module data', () => {
    const areasContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'pages/areas/AreasPage.tsx'),
      'utf8',
    );

    // Must have Cadastral geometry metrics calculation
    expect(areasContent).toContain('computeZoneCadastralMetrics');
    expect(areasContent).toContain('Cadastral Area');
    expect(areasContent).toContain('Boundary Perimeter');
    expect(areasContent).toContain('Boundary Vertices');

    // Must NOT import or embed foreign analysis modals or cross-module services
    expect(areasContent).not.toContain('GisWorkstation');
    expect(areasContent).not.toContain('GisBeforeAfterComparison');
    expect(areasContent).not.toContain('markedAreaService');
    expect(areasContent).not.toContain('Run Satellite GIS Analysis');
    expect(areasContent).not.toContain('Open Zone in Operational Modules');
  });

  // ─── GATE 4: Satellite Catalog strict data isolation ──────────────────────
  it('Gate 4: Satellite Catalog displays only satellite observations, metadata & footprints', () => {
    const satelliteContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'pages/satellite/SatellitePage.tsx'),
      'utf8',
    );

    // Shows satellite data
    expect(satelliteContent).toContain('satelliteService');
    expect(satelliteContent).toContain('imageId');
    expect(satelliteContent).toContain('cloudCover');
    expect(satelliteContent).toContain('footprint');

    // Does NOT aggregate other module databases
    expect(areasOrSatForeignCheck(satelliteContent)).toBe(true);
  });

  function areasOrSatForeignCheck(content: string): boolean {
    const forbiddenImports = [
      'alertService',
      'epassService',
      'checkpointService',
      'reconciliationService',
      'enforcementService',
    ];
    return forbiddenImports.every((imp) => !content.includes(imp));
  }

  // ─── GATE 5: Monitoring Jobs strict data isolation ────────────────────────
  it('Gate 5: Monitoring Jobs scopes strictly to monitoring job scheduler records', () => {
    const monContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'pages/monitoring/MonitoringPage.tsx'),
      'utf8',
    );

    expect(monContent).toContain('monitoringService');
    expect(monContent).toContain('MonitoringJobStatus');
    expect(monContent).toContain('scheduledAt');
    expect(monContent).not.toContain('epassService');
    expect(monContent).not.toContain('checkpointService');
    expect(monContent).not.toContain('reconciliationService');
  });

  // ─── GATE 6: Baselines strict data isolation ──────────────────────────────
  it('Gate 6: Baselines scopes strictly to scientific reference baselines', () => {
    const baseContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'pages/baselines/BaselinePage.tsx'),
      'utf8',
    );

    expect(baseContent).toContain('baselineService');
    expect(baseContent).toContain('BaselineStatus');
    expect(baseContent).toContain('activeOptical');
    expect(baseContent).toContain('activeSar');
    expect(baseContent).not.toContain('miningService');
    expect(baseContent).not.toContain('epassService');
  });

  // ─── GATE 7: Change Detection strict data isolation ───────────────────────
  it('Gate 7: Change Detection scopes strictly to change detection results', () => {
    const changeContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'pages/changes/ChangesPage.tsx'),
      'utf8',
    );

    expect(changeContent).toContain('changeService');
    expect(changeContent).toContain('affectedAreaPercentage');
    expect(changeContent).toContain('comparisonMode');
    expect(changeContent).not.toContain('vehicleService');
    expect(changeContent).not.toContain('driverService');
  });

  // ─── GATE 8: Non-folder modules retain specialized enterprise UI ──────────
  it('Gate 8: Non-folder modules retain specialized enterprise tables, KPIs & workflows', () => {
    // Alerts has alert workflow
    const alerts = fs.readFileSync(path.join(CLIENT_SRC, 'pages/alerts/AlertsPage.tsx'), 'utf8');
    expect(alerts).toContain('alertService');
    expect(alerts).toContain('severity');

    // Mining has authorization table & quotas
    const mining = fs.readFileSync(path.join(CLIENT_SRC, 'pages/mining/MiningAuthorizationPage.tsx'), 'utf8');
    expect(mining).toContain('epassService');
    expect(mining).toContain('permitNumber');

    // Vehicles has registry table
    const vehicles = fs.readFileSync(path.join(CLIENT_SRC, 'pages/fleet/VehicleRegistryPage.tsx'), 'utf8');
    expect(vehicles).toContain('registrationNumber');

    // Drivers has driver table & license
    const drivers = fs.readFileSync(path.join(CLIENT_SRC, 'pages/fleet/DriverRegistryPage.tsx'), 'utf8');
    expect(drivers).toContain('licenseNumber');

    // E-Pass has transit passes
    const epass = fs.readFileSync(path.join(CLIENT_SRC, 'pages/epass/EPassPage.tsx'), 'utf8');
    expect(epass).toContain('epassService');

    // Checkpoints has physical scan logs
    const checkpoint = fs.readFileSync(path.join(CLIENT_SRC, 'pages/checkpoint/CheckpointEnforcementPage.tsx'), 'utf8');
    expect(checkpoint).toContain('checkpointService');

    // Reconciliation has multi-dimensional audit
    const recon = fs.readFileSync(path.join(CLIENT_SRC, 'pages/reconciliation/ReconciliationPage.tsx'), 'utf8');
    expect(recon).toContain('reconciliationService');

    // Reports has executive KPI & export controls
    const reports = fs.readFileSync(path.join(CLIENT_SRC, 'pages/reports/ReportsPage.tsx'), 'utf8');
    expect(reports).toContain('Executive Summary');

    // Enforcement has case management
    const cases = fs.readFileSync(path.join(CLIENT_SRC, 'pages/enforcement/EnforcementCasePage.tsx'), 'utf8');
    expect(cases).toContain('enforcementCaseService');

    // Intelligence has multi-source synthesis
    const intel = fs.readFileSync(path.join(CLIENT_SRC, 'pages/intelligence/IntelligenceDashboardPage.tsx'), 'utf8');
    expect(intel).toContain('intelligenceService');
  });

  // ─── GATE 9: Sidebar Scrolling Architecture (Independent Scrolling) ───────
  it('Gate 9: Sidebar layout has fixed height 100vh with independent main scrolling', () => {
    const layoutContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components/layout/MainLayout.tsx'),
      'utf8',
    );

    // Shell must be height: 100vh and overflow: hidden
    expect(layoutContent).toContain("height: '100vh'");
    expect(layoutContent).toContain("overflow: 'hidden'");

    // Main must be flex: 1 and overflowY: auto
    expect(layoutContent).toContain("overflowY: 'auto'");

    const sidebarContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components/layout/Sidebar.tsx'),
      'utf8',
    );

    // Sidebar must have fixed height, width, flexShrink: 0
    expect(sidebarContent).toContain("height: '100vh'");
    expect(sidebarContent).toContain("width: '260px'");
    expect(sidebarContent).toContain('flexShrink: 0');
    expect(sidebarContent).toContain("overflowY: 'auto'");
  });

  // ─── GATE 10: Zone Context Header breadcrumb & navigation ─────────────────
  it('Gate 10: ZoneContextHeader provides clean GOVT OF TAMIL NADU / MONITORING breadcrumb and back button', () => {
    const headerContent = fs.readFileSync(
      path.join(CLIENT_SRC, 'components/common/ZoneContextHeader.tsx'),
      'utf8',
    );

    expect(headerContent).toContain('GOVT OF TAMIL NADU');
    expect(headerContent).toContain('MONITORING');
    expect(headerContent).toContain('All Zones');
    // Module links in switcher must only list the 5 monitoring workspace modules
    expect(headerContent).toContain("id: 'areas'");
    expect(headerContent).toContain("id: 'satellite'");
    expect(headerContent).toContain("id: 'monitoring'");
    expect(headerContent).toContain("id: 'baselines'");
    expect(headerContent).toContain("id: 'changes'");
    expect(headerContent).not.toContain("id: 'epass'");
    expect(headerContent).not.toContain("id: 'vehicles'");
  });

  // ─── GATE 11: Deep linking & URL parameters preserved ─────────────────────
  it('Gate 11: URL query parameter ?zoneId=... is supported across folder modules', () => {
    for (const relPath of FOLDER_MODULE_FILES) {
      const fullPath = path.join(CLIENT_SRC, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.includes('zoneId') || content.includes('useZoneScopedParams') || content.includes('searchParams')).toBe(true);
    }
  });

  // ─── GATE 12: Conditional ZoneContextHeader in non-folder modules ──────────
  it('Gate 12: Non-folder modules render ZoneContextHeader only conditionally when zone filter active', () => {
    const checkPages = [
      'pages/alerts/AlertsPage.tsx',
      'pages/mining/MiningAuthorizationPage.tsx',
      'pages/fleet/VehicleRegistryPage.tsx',
      'pages/fleet/DriverRegistryPage.tsx',
      'pages/epass/EPassPage.tsx',
      'pages/checkpoint/CheckpointEnforcementPage.tsx',
      'pages/reconciliation/ReconciliationPage.tsx',
    ];

    for (const relPath of checkPages) {
      const fullPath = path.join(CLIENT_SRC, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).toContain('{selectedZone &&');
    }
  });
});
