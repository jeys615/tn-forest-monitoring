import React, { useState, useEffect, useCallback } from 'react';
import { monitoringService } from '../../services/monitoring.service';
import StatusBadge from '../ui/StatusBadge';
import {
  type IncrementalMonitoringStatusDto,
  type AreaMonitoringSummaryDto,
  type MonitoringHealthDto,
  type IncrementalMonitoringCycleResultDto,
  MonitoringTrackStatus,
} from '@tn-forest/shared/types';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

export interface SatelliteMonitoringStatusPanelProps {
  onAreaSelect?: (areaId: string, areaType: string) => void;
}

export const SatelliteMonitoringStatusPanel: React.FC<SatelliteMonitoringStatusPanelProps> = ({
  onAreaSelect,
}) => {
  const [status, setStatus] = useState<IncrementalMonitoringStatusDto | null>(null);
  const [areaSummaries, setAreaSummaries] = useState<AreaMonitoringSummaryDto[]>([]);
  const [health, setHealth] = useState<MonitoringHealthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningCycle, setRunningCycle] = useState(false);
  const [recoveringStale, setRecoveringStale] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastCycleResult, setLastCycleResult] = useState<IncrementalMonitoringCycleResultDto | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, summariesRes, healthRes] = await Promise.all([
        monitoringService.getStatus(),
        monitoringService.getAreaSummaries(),
        monitoringService.getHealth().catch(() => null),
      ]);
      setStatus(statusRes);
      setAreaSummaries(summariesRes);
      if (healthRes) setHealth(healthRes);
    } catch {
      // Graceful fallback for offline / mock
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTriggerCycle = async () => {
    try {
      setRunningCycle(true);
      setFeedbackMsg(null);
      const res = await monitoringService.runMonitoringCycle({ forceAllAreas: false });
      setLastCycleResult(res);
      const discovered = res.discoveredCount ?? res.observationsDiscovered ?? 0;
      const eligible = res.eligibleCount ?? 0;
      const processed = res.processedCount ?? res.observationsProcessed ?? 0;
      const alerts = res.alertCount ?? res.alertsGenerated ?? 0;
      setFeedbackMsg({
        type: 'success',
        text: `Cycle completed in ${res.durationMs}ms. Discovered: ${discovered}, Eligible: ${eligible}, Processed: ${processed}, Alerts: ${alerts}`,
      });
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Monitoring cycle failed';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setRunningCycle(false);
    }
  };

  const handleRecoverStale = async () => {
    try {
      setRecoveringStale(true);
      setFeedbackMsg(null);
      const res = await monitoringService.recoverStaleJobs();
      let detailText = `Stale Job Recovery: ${res.staleJobsDetected} detected, ${res.jobsRecovered} recovered.`;
      if (res.monitoringJobs || res.incrementalMonitoring) {
        const mJobs = res.monitoringJobs?.jobsRecovered ?? 0;
        const incJobs = res.incrementalMonitoring?.recordsRecovered ?? 0;
        detailText = `Stale Job Recovery: ${res.staleJobsDetected} detected (${res.monitoringJobs?.staleJobsFound ?? 0} monitoring jobs, ${res.incrementalMonitoring?.staleRecordsFound ?? 0} incremental records). Recovered: ${mJobs} monitoring jobs, ${incJobs} incremental records.`;
      }
      setFeedbackMsg({
        type: 'success',
        text: detailText,
      });
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stale job recovery failed';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setRecoveringStale(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        borderRadius: RADII.lg,
        border: `1px solid ${COLORS.border}`,
        boxShadow: SHADOWS.sm,
        padding: SPACE.lg,
        marginBottom: SPACE.xl,
      }}
    >
      {/* Header with Title and Trigger Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: SPACE.md,
          marginBottom: SPACE.lg,
          borderBottom: `1px solid ${COLORS.borderLight}`,
          paddingBottom: SPACE.md,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <h3
              style={{
                fontSize: FONT.sizeLg,
                fontWeight: FONT.weightBold,
                color: COLORS.text,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-primary)' }}><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
              Automated Real-Time Satellite Monitoring &amp; Incremental Processing
            </h3>
            <span
              style={{
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightBold,
                padding: '2px 8px',
                borderRadius: RADII.full,
                backgroundColor: '#ECFDF5',
                color: '#065F46',
                border: '1px solid #A7F3D0',
              }}
            >
              REAL-TIME MONITORING
            </span>
            {health && (
              <span
                style={{
                  fontSize: FONT.sizeXs,
                  fontWeight: FONT.weightBold,
                  padding: '2px 8px',
                  borderRadius: RADII.full,
                  backgroundColor: health.gee.connected ? '#EFF6FF' : '#FEF2F2',
                  color: health.gee.connected ? '#1D4ED8' : '#991B1B',
                  border: `1px solid ${health.gee.connected ? '#BFDBFE' : '#FECACA'}`,
                }}
              >
                GEE: {health.gee.connected ? 'ONLINE (REAL)' : 'OFFLINE'}
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: FONT.sizeSm,
              color: COLORS.textMuted,
              margin: '4px 0 0 0',
            }}
          >
            Real GEE Sentinel-2 &amp; Sentinel-1 observation discovery, reduceRegion, baseline index grounding &amp; multi-threshold evidence fusion
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <button
            onClick={handleRecoverStale}
            disabled={recoveringStale || loading}
            style={{
              padding: '6px 12px',
              fontSize: FONT.sizeSm,
              fontWeight: FONT.weightMedium,
              borderRadius: RADII.md,
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.surfaceAlt,
              color: COLORS.text,
              cursor: recoveringStale ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
            title="Recover jobs interrupted by server restart or timeout"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>
            {recoveringStale ? 'Checking...' : 'Recover Stale Jobs'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: '6px 12px',
              fontSize: FONT.sizeSm,
              fontWeight: FONT.weightMedium,
              borderRadius: RADII.md,
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.surface,
              color: COLORS.text,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleTriggerCycle}
            disabled={runningCycle}
            style={{
              padding: '6px 14px',
              fontSize: FONT.sizeSm,
              fontWeight: FONT.weightSemibold,
              borderRadius: RADII.md,
              border: 'none',
              backgroundColor: runningCycle ? COLORS.textLight : COLORS.primary,
              color: '#FFFFFF',
              cursor: runningCycle ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.xs,
            }}
          >
            {runningCycle ? '⏳ Running Cycle...' : '▶️ Run Incremental Scan'}
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          style={{
            padding: `${SPACE.sm} ${SPACE.md}`,
            borderRadius: RADII.md,
            fontSize: FONT.sizeSm,
            marginBottom: SPACE.md,
            backgroundColor: feedbackMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            color: feedbackMsg.type === 'success' ? '#065F46' : '#991B1B',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          }}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Latest Cycle Execution Transparency Result */}
      {lastCycleResult && (
        <div
          style={{
            backgroundColor: COLORS.surfaceAlt,
            borderRadius: RADII.lg,
            border: `1px solid ${COLORS.borderLight}`,
            padding: SPACE.md,
            marginBottom: SPACE.lg,
          }}
        >
          {/* Result Card Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: SPACE.md,
              flexWrap: 'wrap',
              gap: SPACE.sm,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                <span style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: COLORS.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  Monitoring Cycle Result
                </span>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                  ({new Date(lastCycleResult.completedAt).toLocaleTimeString()} · {lastCycleResult.durationMs}ms)
                </span>
              </div>
            </div>
            <div>
              {lastCycleResult.eligibleCount === 0 && lastCycleResult.discoveredCount > 0 ? (
                <span
                  style={{
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightBold,
                    padding: '3px 10px',
                    borderRadius: RADII.full,
                    backgroundColor: '#FEF3C7',
                    color: '#92400E',
                    border: '1px solid #FDE68A',
                  }}
                >
                  WAITING_FOR_NEXT_CYCLE
                </span>
              ) : lastCycleResult.processedCount > 0 ? (
                <span
                  style={{
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightBold,
                    padding: '3px 10px',
                    borderRadius: RADII.full,
                    backgroundColor: '#ECFDF5',
                    color: '#065F46',
                    border: '1px solid #A7F3D0',
                  }}
                >
                  PROCESSED_SUCCESSFULLY
                </span>
              ) : (
                <span
                  style={{
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightBold,
                    padding: '3px 10px',
                    borderRadius: RADII.full,
                    backgroundColor: '#F3F4F6',
                    color: '#4B5563',
                    border: '1px solid #E5E7EB',
                  }}
                >
                  NO_NEW_OBSERVATIONS
                </span>
              )}
            </div>
          </div>

          {/* 4 Metric Counters Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: SPACE.sm,
              marginBottom: SPACE.md,
            }}
          >
            <div
              style={{
                backgroundColor: COLORS.surface,
                padding: '10px 14px',
                borderRadius: RADII.md,
                border: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
                Discovered
              </div>
              <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.infoText }}>
                {lastCycleResult.discoveredCount ?? lastCycleResult.observationsDiscovered ?? 0}
              </div>
              <div style={{ fontSize: '11px', color: COLORS.textMuted }}>GEE satellite scenes</div>
            </div>

            <div
              style={{
                backgroundColor: COLORS.surface,
                padding: '10px 14px',
                borderRadius: RADII.md,
                border: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
                Eligible
              </div>
              <div
                style={{
                  fontSize: FONT.sizeXl,
                  fontWeight: FONT.weightBold,
                  color: (lastCycleResult.eligibleCount ?? 0) > 0 ? COLORS.successText : COLORS.textMuted,
                }}
              >
                {lastCycleResult.eligibleCount ?? 0}
              </div>
              <div style={{ fontSize: '11px', color: COLORS.textMuted }}>Passed all filters</div>
            </div>

            <div
              style={{
                backgroundColor: COLORS.surface,
                padding: '10px 14px',
                borderRadius: RADII.md,
                border: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
                Processed
              </div>
              <div
                style={{
                  fontSize: FONT.sizeXl,
                  fontWeight: FONT.weightBold,
                  color: (lastCycleResult.processedCount ?? 0) > 0 ? COLORS.successText : COLORS.textMuted,
                }}
              >
                {lastCycleResult.processedCount ?? lastCycleResult.observationsProcessed ?? 0}
              </div>
              <div style={{ fontSize: '11px', color: COLORS.textMuted }}>Pipeline execution</div>
            </div>

            <div
              style={{
                backgroundColor: COLORS.surface,
                padding: '10px 14px',
                borderRadius: RADII.md,
                border: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
                Alerts
              </div>
              <div
                style={{
                  fontSize: FONT.sizeXl,
                  fontWeight: FONT.weightBold,
                  color: (lastCycleResult.alertCount ?? 0) > 0 ? COLORS.warningText : COLORS.textMuted,
                }}
              >
                {lastCycleResult.alertCount ?? lastCycleResult.alertsGenerated ?? 0}
              </div>
              <div style={{ fontSize: '11px', color: COLORS.textMuted }}>Change detections</div>
            </div>
          </div>

          {/* Dual-Track Execution Status (Optical Track + SAR Track) */}
          {lastCycleResult.tracks && (
            <div
              style={{
                marginBottom: SPACE.md,
                padding: SPACE.md,
                backgroundColor: COLORS.surface,
                borderRadius: RADII.md,
                border: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <div
                style={{
                  fontSize: FONT.sizeSm,
                  fontWeight: FONT.weightBold,
                  color: COLORS.text,
                  marginBottom: SPACE.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                Independent Monitoring Tracks Evaluation
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: SPACE.md,
                }}
              >
                {/* Optical Track Card */}
                <div
                  style={{
                    padding: SPACE.sm,
                    borderRadius: RADII.md,
                    backgroundColor: lastCycleResult.tracks.optical.enabled ? '#F0FDF4' : '#F8FAFC',
                    border: `1px solid ${lastCycleResult.tracks.optical.enabled ? '#BBF7D0' : '#E2E8F0'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                      Optical Track (Sentinel-2 / Landsat)
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: RADII.full,
                        fontWeight: FONT.weightBold,
                        backgroundColor:
                          lastCycleResult.tracks.optical.status === MonitoringTrackStatus.COMPLETED
                            ? '#DCFCE7'
                            : lastCycleResult.tracks.optical.status === MonitoringTrackStatus.DISABLED
                            ? '#E2E8F0'
                            : lastCycleResult.tracks.optical.status === MonitoringTrackStatus.BASELINE_REQUIRED
                            ? '#FEF3C7'
                            : '#DBEAFE',
                        color:
                          lastCycleResult.tracks.optical.status === MonitoringTrackStatus.COMPLETED
                            ? '#15803D'
                            : lastCycleResult.tracks.optical.status === MonitoringTrackStatus.DISABLED
                            ? '#64748B'
                            : lastCycleResult.tracks.optical.status === MonitoringTrackStatus.BASELINE_REQUIRED
                            ? '#B45309'
                            : '#1D4ED8',
                      }}
                    >
                      {lastCycleResult.tracks.optical.status}
                    </span>
                  </div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'flex', gap: SPACE.md }}>
                    <span>Discovered: <strong>{lastCycleResult.tracks.optical.discoveredCount}</strong></span>
                    <span>Eligible: <strong>{lastCycleResult.tracks.optical.eligibleCount}</strong></span>
                    <span>Processed: <strong>{lastCycleResult.tracks.optical.processedCount}</strong></span>
                    <span>Alerts: <strong>{lastCycleResult.tracks.optical.alertCount}</strong></span>
                  </div>
                </div>

                {/* SAR Track Card */}
                <div
                  style={{
                    padding: SPACE.sm,
                    borderRadius: RADII.md,
                    backgroundColor: lastCycleResult.tracks.sar.enabled ? '#EFF6FF' : '#F8FAFC',
                    border: `1px solid ${lastCycleResult.tracks.sar.enabled ? '#BFDBFE' : '#E2E8F0'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                      SAR Track (Sentinel-1 C-Band)
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: RADII.full,
                        fontWeight: FONT.weightBold,
                        backgroundColor:
                          lastCycleResult.tracks.sar.status === MonitoringTrackStatus.COMPLETED
                            ? '#DCFCE7'
                            : lastCycleResult.tracks.sar.status === MonitoringTrackStatus.DISABLED
                            ? '#E2E8F0'
                            : lastCycleResult.tracks.sar.status === MonitoringTrackStatus.BASELINE_REQUIRED
                            ? '#FEF3C7'
                            : '#DBEAFE',
                        color:
                          lastCycleResult.tracks.sar.status === MonitoringTrackStatus.COMPLETED
                            ? '#15803D'
                            : lastCycleResult.tracks.sar.status === MonitoringTrackStatus.DISABLED
                            ? '#64748B'
                            : lastCycleResult.tracks.sar.status === MonitoringTrackStatus.BASELINE_REQUIRED
                            ? '#B45309'
                            : '#1D4ED8',
                      }}
                    >
                      {lastCycleResult.tracks.sar.status}
                    </span>
                  </div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'flex', gap: SPACE.md }}>
                    <span>Discovered: <strong>{lastCycleResult.tracks.sar.discoveredCount}</strong></span>
                    <span>Eligible: <strong>{lastCycleResult.tracks.sar.eligibleCount}</strong></span>
                    <span>Processed: <strong>{lastCycleResult.tracks.sar.processedCount}</strong></span>
                    <span>Alerts: <strong>{lastCycleResult.tracks.sar.alertCount}</strong></span>
                  </div>
                  {lastCycleResult.tracks.sar.status === MonitoringTrackStatus.DISABLED && (
                    <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '4px', fontStyle: 'italic' }}>
                      Track disabled for this zone. Can be enabled in Zone settings.
                    </div>
                  )}
                  {lastCycleResult.tracks.sar.status === MonitoringTrackStatus.BASELINE_REQUIRED && (
                    <div style={{ fontSize: '11px', color: '#B45309', marginTop: '4px', fontStyle: 'italic' }}>
                      SAR baseline required before automated monitoring can execute.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Condition: Discovered === 0 */}
          {(lastCycleResult.discoveredCount ?? lastCycleResult.observationsDiscovered ?? 0) === 0 && (
            <div
              style={{
                padding: `${SPACE.sm} ${SPACE.md}`,
                borderRadius: RADII.md,
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#1E40AF',
                fontSize: FONT.sizeSm,
                marginBottom: SPACE.md,
              }}
            >
              ℹ️ No satellite observations discovered. GEE returned no observations for this zone and time window.
            </div>
          )}

          {/* Condition: Discovered > 0 && Eligible === 0: Prominent Rejection Breakdown */}
          {(lastCycleResult.discoveredCount ?? lastCycleResult.observationsDiscovered ?? 0) > 0 &&
            (lastCycleResult.eligibleCount ?? 0) === 0 && (
              <div
                style={{
                  padding: SPACE.md,
                  borderRadius: RADII.md,
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FCD34D',
                  marginBottom: SPACE.md,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: SPACE.xs,
                    flexWrap: 'wrap',
                    gap: SPACE.xs,
                  }}
                >
                  <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Why no image was processed?
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: FONT.weightBold,
                      padding: '2px 8px',
                      borderRadius: RADII.full,
                      backgroundColor: '#FEF3C7',
                      color: '#B45309',
                      border: '1px solid #FDE68A',
                    }}
                  >
                    WAITING_FOR_NEXT_CYCLE (Waiting for new cloud-free satellite acquisition)
                  </span>
                </div>
                <p style={{ fontSize: FONT.sizeXs, color: '#78350F', margin: '0 0 10px 0' }}>
                  {lastCycleResult.discoveredCount ?? lastCycleResult.observationsDiscovered} satellite scene(s) were
                  discovered in Google Earth Engine, but all were rejected by production eligibility criteria:
                </p>

                {/* Grouped Rejection Categories */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                  {(lastCycleResult.rejectionSummary?.CLOUD_COVER_EXCEEDS_THRESHOLD ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                        Cloud cover exceeded threshold ({lastCycleResult.rejectionSummary?.CLOUD_COVER_EXCEEDS_THRESHOLD} scene{lastCycleResult.rejectionSummary?.CLOUD_COVER_EXCEEDS_THRESHOLD > 1 ? 's' : ''})
                      </div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
                        Threshold: &le; {lastCycleResult.searchConfig?.cloudCoverThreshold ?? 20}% cloud cover
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'CLOUD_COVER_EXCEEDS_THRESHOLD')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> (Acquired:{' '}
                              {o.acquisitionTime ? new Date(o.acquisitionTime).toISOString().slice(0, 10) : 'unknown'}) —{' '}
                              <strong>{o.cloudCover !== undefined ? `${o.cloudCover.toFixed(1)}% cloud` : 'high cloud'}</strong>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.SENSOR_TRACK_MISMATCH ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        Sensor track mismatch ({lastCycleResult.rejectionSummary?.SENSOR_TRACK_MISMATCH} scene{lastCycleResult.rejectionSummary?.SENSOR_TRACK_MISMATCH > 1 ? 's' : ''})
                      </div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
                        Active baseline requires {lastCycleResult.searchConfig?.activeBaselineSensor ?? 'OPTICAL'} sensor imagery
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'SENSOR_TRACK_MISMATCH')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> ({o.sensor ?? 'SAR'}, acquired{' '}
                              {o.acquisitionTime ? new Date(o.acquisitionTime).toISOString().slice(0, 10) : 'unknown'}) — Sensor does not match active baseline track ({lastCycleResult.searchConfig?.activeBaselineSensor ?? 'OPTICAL'})
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.SAR_RELATIVE_ORBIT_MISMATCH ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FCA5A5',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        Incompatible SAR relative orbit track ({lastCycleResult.rejectionSummary?.SAR_RELATIVE_ORBIT_MISMATCH} scene{(lastCycleResult.rejectionSummary?.SAR_RELATIVE_ORBIT_MISMATCH ?? 0) > 1 ? 's' : ''})
                      </div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
                        Sentinel-1 repeat observations must share identical relative orbit geometry. Differing incidence angles (~11° variance) produce severe false-positive backscatter variation.
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'SAR_RELATIVE_ORBIT_MISMATCH')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> — {o.reason}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.SAR_ORBIT_DIRECTION_MISMATCH ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FCA5A5',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Incompatible SAR pass direction ({lastCycleResult.rejectionSummary?.SAR_ORBIT_DIRECTION_MISMATCH} scene{(lastCycleResult.rejectionSummary?.SAR_ORBIT_DIRECTION_MISMATCH ?? 0) > 1 ? 's' : ''})
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'SAR_ORBIT_DIRECTION_MISMATCH')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> — {o.reason}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.TEMPORAL_INELIGIBLE ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#92400E' }}>
                        ⏱️ Not newer than last processed ({lastCycleResult.rejectionSummary?.TEMPORAL_INELIGIBLE} scene{lastCycleResult.rejectionSummary?.TEMPORAL_INELIGIBLE > 1 ? 's' : ''})
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'TEMPORAL_INELIGIBLE')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> — {o.reason}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.GEOMETRY_NOT_INTERSECTING ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                        Geometry not intersecting ({lastCycleResult.rejectionSummary?.GEOMETRY_NOT_INTERSECTING} scene{lastCycleResult.rejectionSummary?.GEOMETRY_NOT_INTERSECTING > 1 ? 's' : ''})
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'GEOMETRY_NOT_INTERSECTING')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> — Does not intersect monitoring zone geometry
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.DUPLICATE_OBSERVATION ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        Duplicate observation ({lastCycleResult.rejectionSummary?.DUPLICATE_OBSERVATION} scene{lastCycleResult.rejectionSummary?.DUPLICATE_OBSERVATION > 1 ? 's' : ''})
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: FONT.sizeXs, color: COLORS.text }}>
                        {lastCycleResult.rejectedObservations
                          ?.filter((o) => o.reasonCode === 'DUPLICATE_OBSERVATION')
                          .map((o) => (
                            <li key={o.imageId} style={{ marginTop: '2px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{o.imageId.split('/').pop()}</span> — Already evaluated in a previous cycle
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {(lastCycleResult.rejectionSummary?.BASELINE_MATCH ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: RADII.sm,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                        Matches active baseline ({lastCycleResult.rejectionSummary?.BASELINE_MATCH} scene{lastCycleResult.rejectionSummary?.BASELINE_MATCH > 1 ? 's' : ''})
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Search Configuration Bar */}
          {lastCycleResult.searchConfig && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: SPACE.md,
                padding: '8px 12px',
                backgroundColor: COLORS.surface,
                borderRadius: RADII.md,
                border: `1px solid ${COLORS.borderLight}`,
                fontSize: FONT.sizeXs,
                color: COLORS.textMuted,
              }}
            >
              <div>
                <strong style={{ color: COLORS.text }}>Search Window:</strong>{' '}
                {lastCycleResult.searchConfig.searchWindowStart
                  ? new Date(lastCycleResult.searchConfig.searchWindowStart).toISOString().slice(0, 10)
                  : '—'}{' '}
                to{' '}
                {lastCycleResult.searchConfig.searchWindowEnd
                  ? new Date(lastCycleResult.searchConfig.searchWindowEnd).toISOString().slice(0, 10)
                  : '—'}
              </div>
              <div>
                <strong style={{ color: COLORS.text }}>Cloud Threshold:</strong> &le;{' '}
                {lastCycleResult.searchConfig.cloudCoverThreshold}%
              </div>
              <div>
                <strong style={{ color: COLORS.text }}>Active Baseline:</strong>{' '}
                {lastCycleResult.searchConfig.activeBaselineSensor ?? 'OPTICAL'}
                {lastCycleResult.searchConfig.activeBaselineSource
                  ? ` (${lastCycleResult.searchConfig.activeBaselineSource})`
                  : ''}
              </div>
              {lastCycleResult.searchConfig.lastProcessedDate && (
                <div>
                  <strong style={{ color: COLORS.text }}>Last Processed:</strong>{' '}
                  {new Date(lastCycleResult.searchConfig.lastProcessedDate).toISOString().slice(0, 10)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: SPACE.md,
          marginBottom: SPACE.lg,
        }}
      >
        <div
          style={{
            backgroundColor: COLORS.surfaceAlt,
            padding: SPACE.md,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
            Active Monitoring Areas
          </div>
          <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.text, marginTop: '4px' }}>
            {status?.totalActiveAreas ?? 0}
          </div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
            {status?.activePermanentZones ?? 0} Perm · {status?.activeTemporaryAreas ?? 0} Temp
          </div>
        </div>

        <div
          style={{
            backgroundColor: COLORS.surfaceAlt,
            padding: SPACE.md,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
            Observations Discovered
          </div>
          <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.infoText, marginTop: '4px' }}>
            {status?.totalObservationsDiscovered ?? 0}
          </div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
            GEE S2 / S1 Imagery
          </div>
        </div>

        <div
          style={{
            backgroundColor: COLORS.surfaceAlt,
            padding: SPACE.md,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
            Processed Pipeline
          </div>
          <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.successText, marginTop: '4px' }}>
            {status?.totalObservationsProcessed ?? 0}
          </div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
            Harmonized reduceRegion
          </div>
        </div>

        <div
          style={{
            backgroundColor: COLORS.surfaceAlt,
            padding: SPACE.md,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
            Alerts Generated
          </div>
          <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.warningText, marginTop: '4px' }}>
            {status?.totalAlertsGenerated ?? 0}
          </div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
            ≥ 2% Threshold Crossed
          </div>
        </div>

        <div
          style={{
            backgroundColor: COLORS.surfaceAlt,
            padding: SPACE.md,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightMedium }}>
            Pipeline Health
          </div>
          <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: (status?.totalProcessingFailures ?? 0) > 0 ? COLORS.dangerText : COLORS.successText, marginTop: '4px' }}>
            {(status?.totalProcessingFailures ?? 0) === 0 ? '100% OK' : `${status?.totalProcessingFailures} Failed`}
          </div>
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '2px' }}>
            {status?.retryPendingCount ? `${status.retryPendingCount} Retrying` : status?.lastSchedulerRun ? `Last: ${new Date(status.lastSchedulerRun).toLocaleTimeString()}` : 'Ready'}
          </div>
        </div>
      </div>

      {/* Area-Level Monitoring Table */}
      <div>
        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.text, marginBottom: SPACE.sm }}>
          Area-Level Monitoring & Observation Status
        </div>

        <div style={{ overflowX: 'auto', border: `1px solid ${COLORS.borderLight}`, borderRadius: RADII.md }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm }}>
            <thead>
              <tr style={{ backgroundColor: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>Area Name</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>Type</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>Last Processed Sensing Date</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>Latest Observation</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>Alert Severity</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {areaSummaries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: SPACE.lg, color: COLORS.textMuted }}>
                    No active monitored areas configured.
                  </td>
                </tr>
              ) : (
                areaSummaries.map((a) => (
                  <tr
                    key={a.areaId}
                    onClick={() => onAreaSelect?.(a.areaId, a.areaType)}
                    style={{
                      borderBottom: `1px solid ${COLORS.borderLight}`,
                      cursor: onAreaSelect ? 'pointer' : 'default',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: FONT.weightSemibold, color: COLORS.text }}>
                      {a.areaName}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: FONT.sizeXs,
                          fontWeight: FONT.weightBold,
                          padding: '2px 6px',
                          borderRadius: RADII.sm,
                          backgroundColor: a.areaType === 'PERMANENT' ? '#EFF6FF' : '#FDF4FF',
                          color: a.areaType === 'PERMANENT' ? '#1D4ED8' : '#86198F',
                          border: `1px solid ${a.areaType === 'PERMANENT' ? '#BFDBFE' : '#F5D0FE'}`,
                        }}
                      >
                        {a.areaType}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textMuted }}>
                      {a.lastProcessedAcquisitionDate
                        ? new Date(a.lastProcessedAcquisitionDate).toISOString().slice(0, 10)
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textMuted, fontFamily: 'monospace', fontSize: FONT.sizeXs }}>
                      {a.latestObservationId ? a.latestObservationId.split('/').pop()?.slice(0, 24) + '...' : 'Pending scan'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {a.latestAlertSeverity === 'HIGH' ? (
                        <StatusBadge label="HIGH" variant="danger" dot />
                      ) : a.latestAlertSeverity === 'MEDIUM' ? (
                        <StatusBadge label="MEDIUM" variant="warning" dot />
                      ) : a.latestAlertSeverity === 'LOW' ? (
                        <StatusBadge label="LOW" variant="info" dot />
                      ) : (
                        <StatusBadge label="NONE" variant="neutral" />
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {a.processingStatus === 'COMPLETED' ? (
                        <StatusBadge label="ACTIVE" variant="success" dot />
                      ) : (
                        <StatusBadge label="PENDING" variant="neutral" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
