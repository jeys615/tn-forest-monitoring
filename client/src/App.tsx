import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';
import Loading from './components/common/Loading';
import { Permission } from '@tn-forest/shared/types';

// Route-level code splitting via React.lazy()
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const UsersPage = lazy(() => import('./pages/users/UsersPage'));
const AreasPage = lazy(() => import('./pages/areas/AreasPage'));
const SatellitePage = lazy(() => import('./pages/satellite/SatellitePage'));
const MonitoringPage = lazy(() => import('./pages/monitoring/MonitoringPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/errors/NotFoundPage'));
const UnauthorizedPage = lazy(() => import('./pages/errors/UnauthorizedPage'));
const BaselinePage = lazy(() => import('./pages/baselines/BaselinePage'));
const ChangesPage = lazy(() => import('./pages/changes/ChangesPage'));
const AlertsPage = lazy(() => import('./pages/alerts/AlertsPage'));
const TemporaryAnalysisPage = lazy(() => import('./pages/temporaryAnalysis/TemporaryAnalysisPage'));
const EPassPage = lazy(() => import('./pages/epass/EPassPage'));
const MiningAuthorizationPage = lazy(() => import('./pages/mining/MiningAuthorizationPage'));
const VehicleRegistryPage = lazy(() => import('./pages/fleet/VehicleRegistryPage'));
const DriverRegistryPage = lazy(() => import('./pages/fleet/DriverRegistryPage'));
const TransporterPortalPage = lazy(() => import('./pages/transporter/TransporterPortalPage'));
const CheckpointEnforcementPage = lazy(() => import('./pages/checkpoint/CheckpointEnforcementPage'));
const ReconciliationPage = lazy(() =>
  import('./pages/reconciliation/ReconciliationPage').then((m) => ({ default: m.ReconciliationPage || m.default }))
);
const EnforcementCasePage = lazy(() =>
  import('./pages/enforcement/EnforcementCasePage').then((m) => ({ default: m.EnforcementCasePage }))
);
const IntelligenceDashboardPage = lazy(() =>
  import('./pages/intelligence/IntelligenceDashboardPage').then((m) => ({ default: m.IntelligenceDashboardPage }))
);
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const OfflineChangeDetectionPage = lazy(() => import('./pages/offlineChangeDetection/OfflineChangeDetectionPage'));


function App() {
  return (
    <Suspense fallback={<Loading fullPage message="Loading workstation..." />}>
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes inside Main Application Layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* User Management Route (Requires USER_READ permission) */}
            <Route element={<ProtectedRoute requiredPermission={Permission.USER_READ} />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>

            {/* Area/Zone Management Route (Requires AREA_READ permission) */}
            <Route element={<ProtectedRoute requiredPermission={Permission.AREA_READ} />}>
              <Route path="/areas" element={<AreasPage />} />
            </Route>

            {/* Satellite Acquisition & Baseline Routes (Requires MONITORING_READ permission) */}
            <Route element={<ProtectedRoute requiredPermission={Permission.MONITORING_READ} />}>
              <Route path="/satellite" element={<SatellitePage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="/baselines" element={<BaselinePage />} />
              <Route path="/changes" element={<ChangesPage />} />
              <Route path="/temporary-analysis" element={<TemporaryAnalysisPage />} />
              <Route path="/offline-change-detection" element={<OfflineChangeDetectionPage />} />
            </Route>

            {/* Transport & E-Pass Management Routes */}
            <Route element={<ProtectedRoute requiredPermission={Permission.EPASS_READ} />}>
              <Route path="/transporter-portal" element={<TransporterPortalPage />} />
              <Route path="/epass" element={<EPassPage />} />
              <Route path="/mining-authorizations" element={<MiningAuthorizationPage />} />
              <Route path="/vehicles" element={<VehicleRegistryPage />} />
              <Route path="/drivers" element={<DriverRegistryPage />} />
            </Route>

            {/* Checkpoint Enforcement Routes */}
            <Route element={<ProtectedRoute requiredPermission={Permission.CHECKPOINT_READ} />}>
              <Route path="/checkpoints" element={<CheckpointEnforcementPage />} />
            </Route>

            {/* Mining & Transport Reconciliation Route */}
            <Route element={<ProtectedRoute requiredPermission={Permission.RECONCILIATION_READ} />}>
              <Route path="/reconciliation" element={<ReconciliationPage />} />
            </Route>

            {/* M12 Enforcement Case Management Route */}
            <Route element={<ProtectedRoute requiredPermission={Permission.ENFORCEMENT_CASE_READ} />}>
              <Route path="/enforcement-cases" element={<EnforcementCasePage />} />
            </Route>

            {/* M13 Intelligence Dashboard Route (Requires INTELLIGENCE_READ permission) */}
            <Route element={<ProtectedRoute requiredPermission={Permission.INTELLIGENCE_READ} />}>
              <Route path="/intelligence" element={<IntelligenceDashboardPage />} />
            </Route>

            {/* Alerts Management Route (Requires ALERT_READ permission) */}
            <Route element={<ProtectedRoute requiredPermission={Permission.ALERT_READ} />}>
              <Route path="/alerts" element={<AlertsPage />} />
            </Route>

            {/* M11 Reports & Statutory Analytics Route (Requires INTELLIGENCE_READ permission) */}
            <Route element={<ProtectedRoute requiredPermission={Permission.INTELLIGENCE_READ} />}>
              <Route path="/reports" element={<ReportsPage />} />
            </Route>

            {/* Fallback 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
