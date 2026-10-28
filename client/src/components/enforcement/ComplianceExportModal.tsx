import React, { useState } from 'react';
import type { ZoneDto, ComplianceReportFilters, ComplianceReportDto } from '@tn-forest/shared/types';
import { evidenceDossierService } from '../../services/evidenceDossier.service';

interface ComplianceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: ZoneDto[];
}

export const ComplianceExportModal: React.FC<ComplianceExportModalProps> = ({
  isOpen,
  onClose,
  zones,
}) => {
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: ComplianceReportFilters = {};
      if (startDate) filters.startDate = new Date(startDate).toISOString();
      if (endDate) filters.endDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      if (selectedZoneId) filters.zoneId = selectedZoneId;

      const result = await evidenceDossierService.getComplianceReport(filters, format);

      if (format === 'csv') {
        const blob = result as Blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Statutory_Compliance_Report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const jsonReport = result as ComplianceReportDto;
        const blob = new Blob([JSON.stringify(jsonReport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${jsonReport.reportId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Failed to export compliance report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="ws-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ws-modal-dialog" style={{ maxWidth: 560 }}>
        <div className="ws-modal-header">
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Export Statutory Compliance Report
            </h3>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Official export under environmental monitoring and MMDR regulatory frameworks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ws-btn ws-btn-ghost"
            style={{ fontSize: 16, padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>

        <div className="ws-modal-body">
          {error && (
            <div className="ws-alert-box ws-alert-danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>{error}</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Date Range */}
            <div className="ws-grid-2">
              <div className="ws-form-group" style={{ marginBottom: 0 }}>
                <label className="ws-label">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="ws-input"
                />
              </div>
              <div className="ws-form-group" style={{ marginBottom: 0 }}>
                <label className="ws-label">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="ws-input"
                />
              </div>
            </div>

            {/* Zone Filter */}
            <div className="ws-form-group" style={{ marginBottom: 0 }}>
              <label className="ws-label">Filter by Zone (Optional)</label>
              <select
                value={selectedZoneId}
                onChange={(e) => setSelectedZoneId(e.target.value)}
                className="ws-select"
              >
                <option value="">All State Monitored Zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.category.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
            </div>

            {/* Export Format */}
            <div className="ws-form-group" style={{ marginBottom: 0 }}>
              <label className="ws-label">Export Format</label>
              <div className="ws-grid-2">
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  className={`ws-btn ${format === 'csv' ? 'ws-btn-primary' : 'ws-btn-secondary'}`}
                  style={{ justifyContent: 'center' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  RFC 4180 CSV
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`ws-btn ${format === 'json' ? 'ws-btn-primary' : 'ws-btn-secondary'}`}
                  style={{ justifyContent: 'center' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                  Structured JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="ws-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="ws-btn ws-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="ws-btn ws-btn-primary"
          >
            {loading ? (
              <>
                <span className="ws-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Generating Report...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download {format.toUpperCase()} Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
