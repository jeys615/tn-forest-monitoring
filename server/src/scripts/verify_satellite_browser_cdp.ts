import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface CdpMessage {
  id: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  public consoleLogs: string[] = [];
  public consoleErrors: string[] = [];
  public networkErrors: string[] = [];

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg: CdpMessage = JSON.parse(event.data.toString());
        if (msg.method === 'Console.messageAdded') {
          const text = msg.params?.message?.text || '';
          const level = msg.params?.message?.level || 'log';
          this.consoleLogs.push(`[${level}] ${text}`);
          if (level === 'error') {
            this.consoleErrors.push(text);
          }
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          const args = (msg.params?.args || []).map((a: any) => a.value ?? a.description ?? '').join(' ');
          const type = msg.params?.type || 'log';
          this.consoleLogs.push(`[${type}] ${args}`);
          if (type === 'error') {
            this.consoleErrors.push(args);
          }
        } else if (msg.method === 'Network.responseReceived') {
          const resp = msg.params?.response;
          if (resp && resp.status >= 400 && !resp.url.includes('favicon')) {
            this.networkErrors.push(`${resp.status} ${resp.url}`);
          }
        }

        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`);
    }
    return res.result?.value;
  }

  async wait(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  async waitForSelector(selector: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(`Boolean(document.querySelector('${selector}'))`);
      if (exists) return true;
      await this.wait(300);
    }
    return false;
  }

  close() {
    this.ws.close();
  }
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('🌐 RUNNING AUTOMATED BROWSER VERIFICATION: SATELLITE CATALOG');
  console.log('================================================================\n');

  // 1. Obtain backend authentication token directly
  console.log('▶ Authenticating against backend API (http://localhost:5000/api/auth/login)...');
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@tnforest.gov.in',
      password: 'Admin@TNFMS2026!',
    }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token;
  if (!token) {
    throw new Error('Failed to obtain token from backend: ' + JSON.stringify(loginData));
  }
  console.log(`  ✔ Successfully authenticated as admin (User: ${loginData.data?.user?.email})`);

  // 2. Launch Chrome
  const userDataDir = path.join(os.tmpdir(), `chrome-test-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    'http://localhost:5173',
  ];

  console.log('\n▶ Launching Google Chrome headless with CDP on port 9222...');
  const chromeProc = spawn(chromePath, chromeArgs, { stdio: 'ignore' });

  let wsUrl = '';
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:9222/json');
      const tabs = await res.json();
      const pageTab = tabs.find((t: any) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pageTab) {
        wsUrl = pageTab.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Failed to connect to Chrome CDP within timeout!');
  }

  console.log(`  ✔ Connected to Chrome target: ${wsUrl}`);
  const client = new CdpClient(wsUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Console.enable');
  await client.send('Network.enable');

  let passedGates = 0;
  let totalGates = 0;
  const gate = (name: string, ok: boolean, details?: any) => {
    totalGates++;
    if (ok) {
      passedGates++;
      console.log(`  ✅ Gate ${totalGates} Passed: ${name}`);
    } else {
      console.error(`  ❌ Gate ${totalGates} Failed: ${name}`, details || '');
    }
  };

  try {
    // 3. Inject authentication token into client localStorage
    console.log('\n▶ Injecting authentication token into browser localStorage...');
    await client.wait(1500);
    await client.evaluate(`
      localStorage.setItem('token', '${token}');
    `);
    gate('Browser Session & LocalStorage Token Injected', true);

    // ─── STEP 2: ZONE A — "testing" (ZONE-261007-2771) ───────────
    console.log('\n▶ Step 2: Navigating to Zone A: "testing" (ZONE-261007-2771)...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/satellite?zoneId=6ac64221540f1518603d05ff' });
    
    // Wait for table rows to appear
    await client.waitForSelector('table tbody tr', 8000);
    await client.wait(1500);

    const currentUrl = await client.evaluate('window.location.href');
    const bodyText = await client.evaluate('document.body.innerText');
    console.log('Current URL in browser:', currentUrl);
    console.log('Current Body Text in browser:', bodyText.slice(0, 300));

    const zoneAInfo = await client.evaluate(`
      (() => {
        const titleEl = document.querySelector('h1');
        const countBadges = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.includes('record'));
        const rows = document.querySelectorAll('table tbody tr');
        const paths = document.querySelectorAll('.leaflet-container svg path');
        const boundaryPaths = Array.from(paths).filter(p => {
          const stroke = p.getAttribute('stroke')?.toLowerCase();
          const fill = p.getAttribute('fill')?.toLowerCase();
          return stroke === '#059669' || fill === '#10b981';
        });

        const rowTexts = Array.from(rows).map(r => Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()));

        return {
          title: titleEl?.innerText || '',
          countBadgeText: countBadges[0]?.innerText || '',
          tableRowCount: rows.length,
          boundaryPathsFound: boundaryPaths.length,
          sampleRow: rowTexts[0] || [],
        };
      })()
    `);

    console.log('  Zone A State in DOM:', {
      title: zoneAInfo.title,
      badge: zoneAInfo.countBadgeText,
      rows: zoneAInfo.tableRowCount,
      boundaries: zoneAInfo.boundaryPathsFound,
      firstScene: zoneAInfo.sampleRow[0],
    });

    gate('Zone A: Real Satellite Records Visible in UI Table (3 records)', zoneAInfo.tableRowCount === 3, zoneAInfo);
    gate('Zone A: Selected Zone Real Boundary Rendered on Leaflet Map (#059669)', zoneAInfo.boundaryPathsFound >= 1, zoneAInfo);
    gate('Zone A: Table Columns Populated with Real Metadata', zoneAInfo.sampleRow.length >= 8 && zoneAInfo.sampleRow[0].includes('COPERNICUS'));

    // ─── STEP 3: ZONE B — "VALIDATION-SIRUMALAI-S2" ──────────────
    console.log('\n▶ Step 3: Switching to Zone B: "VALIDATION-SIRUMALAI-S2" (ZONE-261007-4447)...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/satellite?zoneId=6ac5a9d496837067de289f3b' });
    await client.waitForSelector('table tbody tr', 8000);
    await client.wait(1500);

    const zoneBInfo = await client.evaluate(`
      (() => {
        const titleEl = document.querySelector('h1');
        const countBadges = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.includes('record'));
        const rows = document.querySelectorAll('table tbody tr');
        const paths = document.querySelectorAll('.leaflet-container svg path');
        const boundaryPaths = Array.from(paths).filter(p => {
          const stroke = p.getAttribute('stroke')?.toLowerCase();
          const fill = p.getAttribute('fill')?.toLowerCase();
          return stroke === '#059669' || fill === '#10b981';
        });

        const rowTexts = Array.from(rows).map(r => Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()));

        return {
          title: titleEl?.innerText || '',
          countBadgeText: countBadges[0]?.innerText || '',
          tableRowCount: rows.length,
          boundaryPathsFound: boundaryPaths.length,
          sampleRow: rowTexts[0] || [],
        };
      })()
    `);

    console.log('  Zone B State in DOM:', {
      title: zoneBInfo.title,
      badge: zoneBInfo.countBadgeText,
      rows: zoneBInfo.tableRowCount,
      boundaries: zoneBInfo.boundaryPathsFound,
      firstScene: zoneBInfo.sampleRow[0],
    });

    gate('Zone B: Records Switched Dynamically (7 records for Sirumalai)', zoneBInfo.tableRowCount === 7, zoneBInfo);
    gate('Zone B: Zone A Stale Records Completely Removed', zoneBInfo.tableRowCount !== zoneAInfo.tableRowCount);
    gate('Zone B: Selected Zone Real Boundary Rendered on Leaflet Map (#059669)', zoneBInfo.boundaryPathsFound >= 1, zoneBInfo);

    // ─── STEP 4: ZONE C — "M4 Test Zone" (ZONE-261003-8778) ──────
    console.log('\n▶ Step 4: Switching to Zone C: "M4 Test Zone" (ZONE-261003-8778)...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/satellite?zoneId=6ac0e18e1631811fece60769' });
    await client.waitForSelector('table tbody tr', 8000);
    await client.wait(1500);

    const zoneCInfo = await client.evaluate(`
      (() => {
        const titleEl = document.querySelector('h1');
        const countBadges = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.includes('record'));
        const rows = document.querySelectorAll('table tbody tr');
        const paths = document.querySelectorAll('.leaflet-container svg path');
        const boundaryPaths = Array.from(paths).filter(p => {
          const stroke = p.getAttribute('stroke')?.toLowerCase();
          const fill = p.getAttribute('fill')?.toLowerCase();
          return stroke === '#059669' || fill === '#10b981';
        });

        const rowTexts = Array.from(rows).map(r => Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()));

        return {
          title: titleEl?.innerText || '',
          countBadgeText: countBadges[0]?.innerText || '',
          tableRowCount: rows.length,
          boundaryPathsFound: boundaryPaths.length,
          sampleRow: rowTexts[0] || [],
        };
      })()
    `);

    console.log('  Zone C State in DOM:', {
      title: zoneCInfo.title,
      badge: zoneCInfo.countBadgeText,
      rows: zoneCInfo.tableRowCount,
      boundaries: zoneCInfo.boundaryPathsFound,
      firstScene: zoneCInfo.sampleRow[0],
    });

    gate('Zone C: Records Switched Dynamically (2 records for M4 Test Zone)', zoneCInfo.tableRowCount === 2, zoneCInfo);
    gate('Zone C: Zone B Stale Records Completely Removed', zoneCInfo.tableRowCount !== zoneBInfo.tableRowCount);
    gate('Zone C: Selected Zone Real Boundary Rendered on Leaflet Map (#059669)', zoneCInfo.boundaryPathsFound >= 1, zoneCInfo);

    // ─── STEP 5: ZONE D — "M12 Reserved Forest Zone" ─────────────
    console.log('\n▶ Step 5: Switching to Zone D: "M12 Reserved Forest Zone"...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/satellite?zoneId=6ac0ea0d5a8d6c351db5b16c' });
    await client.waitForSelector('table tbody tr', 8000);
    await client.wait(1500);

    const zoneDInfo = await client.evaluate(`
      (() => {
        const titleEl = document.querySelector('h1');
        const countBadges = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.includes('record'));
        const rows = document.querySelectorAll('table tbody tr');
        const paths = document.querySelectorAll('.leaflet-container svg path');
        const boundaryPaths = Array.from(paths).filter(p => {
          const stroke = p.getAttribute('stroke')?.toLowerCase();
          const fill = p.getAttribute('fill')?.toLowerCase();
          return stroke === '#059669' || fill === '#10b981';
        });

        const rowTexts = Array.from(rows).map(r => Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim()));

        return {
          title: titleEl?.innerText || '',
          countBadgeText: countBadges[0]?.innerText || '',
          tableRowCount: rows.length,
          boundaryPathsFound: boundaryPaths.length,
          sampleRow: rowTexts[0] || [],
        };
      })()
    `);

    console.log('  Zone D State in DOM:', {
      title: zoneDInfo.title,
      badge: zoneDInfo.countBadgeText,
      rows: zoneDInfo.tableRowCount,
      boundaries: zoneDInfo.boundaryPathsFound,
      firstScene: zoneDInfo.sampleRow[0],
    });

    gate('Zone D: Records Switched Dynamically (2 records for M12)', zoneDInfo.tableRowCount === 2, zoneDInfo);
    gate('Zone D: Selected Zone Real Boundary Rendered on Leaflet Map (#059669)', zoneDInfo.boundaryPathsFound >= 1, zoneDInfo);

    // ─── STEP 6: PAGE REFRESH PERSISTENCE ────────────────────────
    console.log('\n▶ Step 6: Reloading page to test URL param persistence...');
    await client.send('Page.reload');
    await client.waitForSelector('table tbody tr', 8000);
    await client.wait(1500);

    const reloadedInfo = await client.evaluate(`
      (() => {
        const titleEl = document.querySelector('h1');
        const rows = document.querySelectorAll('table tbody tr');
        const paths = document.querySelectorAll('.leaflet-container svg path');
        const boundaryPaths = Array.from(paths).filter(p => {
          const stroke = p.getAttribute('stroke')?.toLowerCase();
          const fill = p.getAttribute('fill')?.toLowerCase();
          return stroke === '#059669' || fill === '#10b981';
        });

        return {
          title: titleEl?.innerText || '',
          tableRowCount: rows.length,
          boundaryPathsFound: boundaryPaths.length,
        };
      })()
    `);

    console.log('  Reloaded State in DOM:', reloadedInfo);

    gate('Page Reload: Zone D Still Renders 2 Records on Refresh', reloadedInfo.tableRowCount === 2, reloadedInfo);
    gate('Page Reload: Zone D Boundary Still Rendered on Refresh', reloadedInfo.boundaryPathsFound >= 1, reloadedInfo);

    // ─── STEP 7: CONSOLE & NETWORK INTEGRITY ──────────────────────
    console.log('\n▶ Step 7: Inspecting Browser Console & Network traffic...');
    const criticalErrors = client.consoleErrors.filter(e => !e.includes('favicon') && !e.includes('Download the React DevTools'));
    const criticalNetworkErrors = client.networkErrors.filter(e => !e.includes('favicon'));

    console.log(`  Console errors count: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      console.log('  Errors:', criticalErrors);
    }
    console.log(`  Network 4xx/5xx errors count: ${criticalNetworkErrors.length}`);
    if (criticalNetworkErrors.length > 0) {
      console.log('  Network errors:', criticalNetworkErrors);
    }

    gate('Browser Console Clean: Zero Unhandled Errors', criticalErrors.length === 0, criticalErrors);
    gate('Network Clean: Zero 4xx/5xx API Failures', criticalNetworkErrors.length === 0, criticalNetworkErrors);

    console.log('\n================================================================');
    console.log(`🏆 BROWSER VERIFICATION SUMMARY: ${passedGates}/${totalGates} GATES PASSED`);
    console.log('================================================================\n');

  } finally {
    client.close();
    chromeProc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }

  if (passedGates < totalGates) {
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed with uncaught exception:', err);
  process.exit(1);
});
