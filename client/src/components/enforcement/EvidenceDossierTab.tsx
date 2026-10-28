import React, { useState, useEffect } from 'react';
import type {
  EvidenceDossierDto,
  VerifyDossierResponseDto,
  EnforcementCaseDto,
  ZoneDto,
  GeoJSONPolygon,
  GeoJSONMultiPolygon,
  ChangeDetectionDto,
} from '@tn-forest/shared/types';
import { GisMapMode, CheckpointVerificationResult } from '@tn-forest/shared/types';
import { evidenceDossierService } from '../../services/evidenceDossier.service';
import { GisMapViewer } from '../gis/GisMapViewer';

interface EvidenceDossierTabProps {
  enforcementCase: EnforcementCaseDto;
  zone?: ZoneDto;
}

export const EvidenceDossierTab: React.FC<EvidenceDossierTabProps> = ({
  enforcementCase,
  zone,
}) => {
  const [dossier, setDossier] = useState<EvidenceDossierDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [compiling, setCompiling] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<VerifyDossierResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  // Fetch or compile dossier
  useEffect(() => {
    let isMounted = true;

    async function loadDossier() {
      try {
        setLoading(true);
        setError(null);
        setVerifyResult(null);
        const data = await evidenceDossierService.getLatestDossier(enforcementCase.id);
        if (isMounted) {
          setDossier(data);
        }
      } catch {
        // If not yet compiled, automatically compile initial dossier
        try {
          if (isMounted) setCompiling(true);
          const compiled = await evidenceDossierService.compileDossier(enforcementCase.id);
          if (isMounted) {
            setDossier(compiled);
          }
        } catch (compileErr: unknown) {
          if (isMounted) {
            const e = compileErr as { response?: { data?: { message?: string } }; message?: string };
            setError(e?.response?.data?.message || e?.message || 'Failed to compile evidence dossier');
          }
        } finally {
          if (isMounted) setCompiling(false);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDossier();
    return () => {
      isMounted = false;
    };
  }, [enforcementCase.id]);

  // Handle re-compile
  const handleRecompile = async () => {
    try {
      setCompiling(true);
      setError(null);
      setVerifyResult(null);
      const recompiled = await evidenceDossierService.compileDossier(enforcementCase.id);
      setDossier(recompiled);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Re-compilation failed');
    } finally {
      setCompiling(false);
    }
  };

  // Handle cryptographic verification
  const handleVerify = async () => {
    if (!dossier) return;
    try {
      setVerifying(true);
      setError(null);
      const result = await evidenceDossierService.verifyDossierIntegrity(dossier.dossierId);
      setVerifyResult(result);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Verification check failed');
    } finally {
      setVerifying(false);
    }
  };

  // Copy SHA-256 hash
  const handleCopyHash = () => {
    if (!dossier?.dossierHash) return;
    navigator.clipboard.writeText(dossier.dossierHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Download Dossier as JSON
  const handleDownloadJson = () => {
    if (!dossier) return;
    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dossier.dossierId}_v${dossier.dossierVersion}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading || compiling) {
    return (
      <div className="ws-empty-state">
        <div className="ws-spinner" style={{ marginBottom: 12, borderColor: '#40916C', borderTopColor: 'transparent' }} />
        <p style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
          {compiling ? 'Compiling statutory forensic evidence & computing SHA-256 seal...' : 'Retrieving sealed evidence dossier...'}
        </p>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="ws-alert-box ws-alert-danger" style={{ flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Evidence Dossier Error
        </div>
        <p>{error || 'No dossier available for this case.'}</p>
        <button
          onClick={handleRecompile}
          disabled={compiling}
          className="ws-btn ws-btn-sm ws-btn-danger"
          style={{ width: 'fit-content' }}
        >
          {compiling ? 'Compiling...' : 'Compile Evidence Dossier Now'}
        </button>
      </div>
    );
  }

  // Primary change detection and satellite observations
  const primaryChange = dossier.changeDetections?.[0];
  const primarySatellite = dossier.satelliteLineage?.[0];

  // Construct boundary for GIS viewer
  const mapBoundary: GeoJSONPolygon | GeoJSONMultiPolygon = zone?.boundary || {
    type: 'Polygon',
    coordinates: [
      [
        [78.33, 11.24],
        [78.37, 11.24],
        [78.37, 11.28],
        [78.33, 11.28],
        [78.33, 11.24],
      ],
    ],
  };

  // Convert dossier change detection into ChangeDetectionDto format for GisMapViewer
  const changeDetectionForMap: ChangeDetectionDto | null = primaryChange
    ? ({
        id: primaryChange.changeId,
        changeId: primaryChange.changeId,
        sensorType: primaryChange.sensorType,
        detectedAt: primaryChange.detectedAt,
        changedArea: primaryChange.changedArea,
        affectedAreaPercentage: primaryChange.affectedAreaPercentage,
        severity: primaryChange.severity,
        categories: primaryChange.categories,
        changedGeometry: primaryChange.changedGeometry,
      } as unknown as ChangeDetectionDto)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Cryptographic Seal Banner */}
      <div
        className="ws-card"
        style={{
          borderLeft: '5px solid #16A34A',
          background: 'linear-gradient(135deg, #F0FDF4 0%, var(--color-surface) 100%)',
          marginBottom: 0,
        }}
      >
        <div className="ws-card-body" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span className="ws-badge ws-badge-low" style={{ background: '#DCFCE7', color: '#166534', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  Cryptographically Sealed Evidence Dossier
                </span>
                <span className="ws-badge ws-badge-neutral" style={{ fontFamily: 'monospace' }}>
                  Version {dossier.dossierVersion}
                </span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>
                Dossier ID: <span style={{ fontFamily: 'monospace' }}>{dossier.dossierId}</span>
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Compiled by <strong style={{ color: 'var(--color-text)' }}>{dossier.sealedByName ?? 'Authorized Forest Officer'}</strong> on{' '}
                {new Date(dossier.sealedAt).toLocaleString()}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="ws-btn ws-btn-primary ws-btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {verifying ? (
                  <>
                    <span className="ws-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                    Verifying...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Verify Tamper-Evidence
                  </>
                )}
              </button>
              <button
                onClick={handleRecompile}
                disabled={compiling}
                className="ws-btn ws-btn-secondary ws-btn-sm"
                title="Generate new sealed version incorporating newest verified logs"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                Compile New Version
              </button>
              <button
                onClick={handleDownloadJson}
                className="ws-btn ws-btn-secondary ws-btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Dossier JSON
              </button>
            </div>
          </div>

          {/* Cryptographic Hash Row */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: 'monospace' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-text-muted)' }}>SHA-256 HASH:</span>
              <span style={{ background: '#F1F5F9', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--color-border)', color: 'var(--color-primary)', wordBreak: 'break-all' }}>
                {dossier.dossierHash}
              </span>
              <button
                onClick={handleCopyHash}
                className="ws-btn ws-btn-secondary ws-btn-sm"
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                {copiedHash ? 'Copied' : 'Copy'}
              </button>
            </div>

            {verifyResult && (
              <div>
                {verifyResult.isValid && !verifyResult.isTampered ? (
                  <span className="ws-badge ws-badge-low" style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Cryptographic Integrity Verified (Hash Matches Canonical Payload)
                  </span>
                ) : (
                  <span className="ws-badge ws-badge-critical" style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Tamper Detected! Signature mismatch against canonical payload.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Statutory Legal Reference & Offense Classification */}
      <div className="ws-grid-2">
        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title">Statutory Act & Legal Framework</span>
          </div>
          <div className="ws-card-body" style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: 4 }}>
              Environmental Protection Framework & Mines and Minerals (Development and Regulation) Act 1957
            </div>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Statutory regulations governing unauthorized surface clearing in protected zones and
              Section 4(1) & 21(1) of MMDR Act 1957 (Prohibition of unrecorded mining and mineral transport without valid e-transit pass).
            </p>
          </div>
        </div>

        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title">Jurisdiction & Location Details</span>
          </div>
          <div className="ws-card-body ws-detail-group">
            <div className="ws-detail-row">
              <span className="ws-detail-label">Zone:</span>
              <span className="ws-detail-value">{dossier.caseDetails.zoneName || 'Reserve Forest'}</span>
            </div>
            <div className="ws-detail-row">
              <span className="ws-detail-label">Severity:</span>
              <span className="ws-badge ws-badge-critical">{enforcementCase.severity}</span>
            </div>
            <div className="ws-detail-row">
              <span className="ws-detail-label">Case Title:</span>
              <span className="ws-detail-value">{dossier.caseDetails.title}</span>
            </div>
            <div className="ws-detail-row">
              <span className="ws-detail-label">Offense Classification:</span>
              <span className="ws-detail-value">{dossier.caseDetails.caseType.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Authoritative GIS Map Viewer with Changed-Area Geometry */}
      <div className="ws-card" style={{ marginBottom: 0 }}>
        <div className="ws-card-header">
          <div>
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              Authoritative Changed-Area Geometry & Monitoring Zone Map
            </span>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              High-contrast vectorization of detected forest canopy loss clusters based on authoritative pixel mask.
            </div>
          </div>
          {primaryChange?.changedGeometry && (
            <span className="ws-badge ws-badge-critical" style={{ fontFamily: 'monospace' }}>
              Geometry: {primaryChange.changedGeometry.type}
            </span>
          )}
        </div>

        <div className="ws-card-body" style={{ padding: 12 }}>
          <div style={{ height: 380, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)', position: 'relative' }}>
            <GisMapViewer
              boundary={mapBoundary}
              areaName={dossier.caseDetails.zoneName || 'Monitoring Zone'}
              activeMode={GisMapMode.SATELLITE}
              changeDetection={changeDetectionForMap}
              showBoundary={true}
              showChangeOverlay={true}
              overlayOpacity={0.8}
            />
          </div>
        </div>
      </div>

      {/* 4. Multi-Source Evidence Quadrants */}
      <div className="ws-grid-2">
        {/* Quad 1: Satellite & Optical/SAR Intelligence */}
        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 9.17l4.24-4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M9.17 14.83L4.93 19.07"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/></svg>
              Satellite Observation Lineage
            </span>
            {primarySatellite?.source && (
              <span className="ws-badge ws-badge-info" style={{ fontFamily: 'monospace' }}>
                {primarySatellite.source}
              </span>
            )}
          </div>
          <div className="ws-card-body ws-detail-group">
            {primarySatellite ? (
              <>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Image ID:</span>
                  <span className="ws-detail-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {primarySatellite.imageId}
                  </span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Acquisition Date:</span>
                  <span className="ws-detail-value">{new Date(primarySatellite.acquisitionDate).toLocaleString()}</span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Sensor Type:</span>
                  <span className="ws-detail-value">{primarySatellite.sensorType}</span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Cloud Coverage:</span>
                  <span className="ws-detail-value">{primarySatellite.cloudCover?.toFixed(1) ?? '0.0'}%</span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">GEE Reference:</span>
                  <span className="ws-detail-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {primarySatellite.geeReference || 'N/A'}
                  </span>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No direct satellite metadata record linked.
              </p>
            )}
          </div>
        </div>

        {/* Quad 2: Change Detection & Scientific Evidence */}
        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2v6h6"/><path d="M4 16.5V4a2 2 0 012-2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.25 16.25L16 19"/></svg>
              Canopy Loss & Disturbance Metrics
            </span>
            {primaryChange?.severity && (
              <span className="ws-badge ws-badge-critical">
                {primaryChange.severity} SEVERITY
              </span>
            )}
          </div>
          <div className="ws-card-body ws-detail-group">
            {primaryChange ? (
              <>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Disturbed Area:</span>
                  <span className="ws-detail-value" style={{ color: '#DC2626', fontWeight: 700 }}>
                    {primaryChange.changedArea.toFixed(2)} ha
                  </span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Zone Affected:</span>
                  <span className="ws-detail-value" style={{ color: '#DC2626', fontWeight: 700 }}>
                    {primaryChange.affectedAreaPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Track:</span>
                  <span className="ws-detail-value">{primaryChange.monitoringTrack || 'OPTICAL'}</span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Highest Threshold:</span>
                  <span className="ws-detail-value" style={{ fontFamily: 'monospace', color: '#D97706' }}>
                    {primaryChange.highestThresholdCrossed}%
                  </span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Classification:</span>
                  <span className="ws-detail-value">{primaryChange.categories.join(', ')}</span>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No scientific change detection record associated.
              </p>
            )}
          </div>
        </div>

        {/* Quad 3: Mining Lease & Reconciliation Findings */}
        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/></svg>
              Lease Quota & Reconciliation Audit
            </span>
            {dossier.reconciliation?.reconciliationStatus && (
              <span className="ws-badge ws-badge-high">
                {dossier.reconciliation.reconciliationStatus}
              </span>
            )}
          </div>
          <div className="ws-card-body" style={{ fontSize: 12 }}>
            {dossier.reconciliation ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="ws-grid-2">
                  <div style={{ background: 'var(--color-surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block' }}>Discrepancy Score</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#D97706' }}>
                      {dossier.reconciliation.discrepancyScore}%
                    </span>
                  </div>
                  <div style={{ background: 'var(--color-surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block' }}>Anomalies Detected</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#DC2626' }}>
                      {dossier.reconciliation.anomaliesCount} Anomalies
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Audit Findings:</span>
                  <ul style={{ paddingLeft: 16, color: 'var(--color-text)', lineHeight: 1.5 }}>
                    {dossier.reconciliation.findings.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No lease reconciliation report required or attached.
              </p>
            )}
          </div>
        </div>

        {/* Quad 4: Checkpoint Passages & Transport Integrity */}
        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              Checkpoint & Transport Surveillance
            </span>
            <span className="ws-badge ws-badge-neutral">
              {dossier.checkpointPassages.length} Passages Recorded
            </span>
          </div>
          <div className="ws-card-body" style={{ fontSize: 12 }}>
            {dossier.checkpointPassages.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {dossier.checkpointPassages.map((cp, idx) => (
                  <div key={idx} style={{ background: 'var(--color-surface-alt)', padding: 8, borderRadius: 6, border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700 }}>{cp.checkpointName}</span>
                      <span
                        className={
                          cp.verificationResult === CheckpointVerificationResult.VALID
                            ? 'ws-badge ws-badge-low'
                            : 'ws-badge ws-badge-critical'
                        }
                      >
                        {cp.verificationResult}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: 11, marginTop: 4 }}>
                      <span>Pass #: <strong style={{ color: 'var(--color-text)' }}>{cp.passNumber}</strong></span>
                      <span>{new Date(cp.verificationTimestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No direct checkpoint log entries captured for this case.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 5. UAV Ground Reconnaissance & Enforcement Order */}
      <div className="ws-grid-2">
        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 19 21 12 17 5 21 12 2"/></svg>
              Field & UAV Drone Reconnaissance
            </span>
          </div>
          <div className="ws-card-body ws-detail-group">
            {dossier.uavVerification ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="ws-badge ws-badge-info">
                    {dossier.uavVerification.droneSurveyConducted ? 'Drone Survey Executed' : 'Ground Inspection Only'}
                  </span>
                  <span className={dossier.uavVerification.groundDisturbanceConfirmed ? 'ws-badge ws-badge-critical' : 'ws-badge ws-badge-low'}>
                    {dossier.uavVerification.groundDisturbanceConfirmed ? 'Disturbance Confirmed' : 'Unconfirmed'}
                  </span>
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Site Observations:</span>
                  <span className="ws-detail-value">{dossier.uavVerification.siteObservations || 'N/A'}</span>
                </div>
                {dossier.uavVerification.locationCoordinates && (
                  <div className="ws-detail-row">
                    <span className="ws-detail-label">GPS Coordinates:</span>
                    <span className="ws-detail-value" style={{ fontFamily: 'monospace' }}>
                      [{dossier.uavVerification.locationCoordinates[0]}, {dossier.uavVerification.locationCoordinates[1]}]
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                Field verification pending or not recorded.
              </p>
            )}
          </div>
        </div>

        <div className="ws-card" style={{ marginBottom: 0 }}>
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Formal Statutory Enforcement Order
            </span>
          </div>
          <div className="ws-card-body ws-detail-group">
            {dossier.caseDetails.enforcementAction?.actionType ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="ws-badge ws-badge-critical">
                    {dossier.caseDetails.enforcementAction.actionType.replace(/_/g, ' ')}
                  </span>
                  {dossier.caseDetails.enforcementAction.penaltyAmountInr ? (
                    <span style={{ color: '#16A34A', fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>
                      ₹{dossier.caseDetails.enforcementAction.penaltyAmountInr.toLocaleString('en-IN')}
                    </span>
                  ) : null}
                </div>
                <div className="ws-detail-row">
                  <span className="ws-detail-label">Action Details:</span>
                  <span className="ws-detail-value">{dossier.caseDetails.enforcementAction.actionDetails}</span>
                </div>
                {dossier.caseDetails.enforcementAction.officialOrderReference && (
                  <div className="ws-detail-row">
                    <span className="ws-detail-label">Order Ref:</span>
                    <span className="ws-detail-value" style={{ fontFamily: 'monospace' }}>
                      {dossier.caseDetails.enforcementAction.officialOrderReference}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No formal enforcement orders or penalties recorded yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 6. Chain of Custody Audit Log */}
      <div className="ws-card" style={{ marginBottom: 0 }}>
        <div className="ws-card-header">
          <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            Evidence Chain of Custody & Audit Trail ({dossier.auditTrail.length} Events)
          </span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
            Immutable Log IDs
          </span>
        </div>
        <div className="ws-card-body" style={{ maxHeight: 220, overflowY: 'auto', padding: '8px 16px' }}>
          {dossier.auditTrail.map((log) => (
            <div
              key={log.auditId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border-light)',
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ws-badge ws-badge-primary" style={{ fontSize: 10 }}>
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', fontSize: 11 }}>
                    {log.auditId}
                  </span>
                </div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 2 }}>
                  {log.remarks || 'Standard audit event'}
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-text-muted)' }}>
                <strong style={{ color: 'var(--color-text)', display: 'block' }}>
                  {log.actorName} ({log.actorRole})
                </strong>
                <span>{new Date(log.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
