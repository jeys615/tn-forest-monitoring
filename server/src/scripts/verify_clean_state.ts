async function verifyCleanState(): Promise<void> {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tnforest.gov.in', password: 'Admin@TNFMS2026!' }),
  });
  interface LoginResponseJson {
    success: boolean;
    data?: { token?: string };
  }
  const loginData = (await loginRes.json()) as LoginResponseJson;
  console.log('Login status:', loginRes.status, 'Success:', loginData.success);
  if (!loginData.success || !loginData.data?.token) {
    console.error('Login failed:', loginData);
    process.exit(1);
  }
  const token = loginData.data.token;
  console.log('JWT token acquired successfully.\n');

  const endpoints = [
    { path: '/api/zones', label: 'Zones (M2)' },
    { path: '/api/satellite', label: 'Satellite Imagery (M3)' },
    { path: '/api/monitoring/jobs', label: 'Monitoring Jobs (M4)' },
    { path: '/api/baselines', label: 'Baselines (M5/M8)' },
    { path: '/api/changes', label: 'Change Detections (M6)' },
    { path: '/api/alerts', label: 'Alerts (M6)' },
    { path: '/api/temporary-analysis', label: 'Temporary Areas (M7)' },
    { path: '/api/mining-authorizations', label: 'Mining Authorizations (M9)' },
    { path: '/api/transport-companies', label: 'Transport Companies (M9)' },
    { path: '/api/vehicles', label: 'Vehicles (M9)' },
    { path: '/api/drivers', label: 'Drivers (M9)' },
    { path: '/api/epasses', label: 'E-Passes (M9)' },
    { path: '/api/checkpoints', label: 'Checkpoints (M10)' },
    { path: '/api/checkpoints/logs', label: 'Checkpoint Logs (M10)' },
    { path: '/api/reconciliation/reports', label: 'Reconciliation Reports (M11)' },
    { path: '/api/enforcement-cases', label: 'Enforcement Cases (M12)' },
    { path: '/api/intelligence/summary', label: 'Intelligence KPIs (M13)' },
  ];

  console.log('----------------------------------------------------------------');
  console.log('HTTP ENDPOINT VERIFICATION (READ-ONLY)');
  console.log('----------------------------------------------------------------');

  interface EndpointData {
    records?: unknown[];
    zones?: unknown[];
    alerts?: unknown[];
    cases?: unknown[];
    areas?: unknown[];
    items?: unknown[];
    total?: number;
    totalZones?: number;
  }

  for (const ep of endpoints) {
    const res = await fetch('http://localhost:5000' + ep.path, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const body = (await res.json()) as { data?: EndpointData | unknown[] };
    let count = 0;
    if (Array.isArray(body.data)) {
      count = body.data.length;
    } else if (body.data && typeof body.data === 'object') {
      const d = body.data as EndpointData;
      if (Array.isArray(d.records)) count = d.records.length;
      else if (Array.isArray(d.zones)) count = d.zones.length;
      else if (Array.isArray(d.alerts)) count = d.alerts.length;
      else if (Array.isArray(d.cases)) count = d.cases.length;
      else if (Array.isArray(d.areas)) count = d.areas.length;
      else if (Array.isArray(d.items)) count = d.items.length;
      else if (typeof d.total === 'number') count = d.total;
      else if (typeof d.totalZones === 'number') count = d.totalZones;
    }
    console.log(`  ${ep.label.padEnd(30)} : Status ${res.status} | Active Records: ${count}`);
  }

  console.log('----------------------------------------------------------------\n');
  process.exit(0);
}

verifyCleanState().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
