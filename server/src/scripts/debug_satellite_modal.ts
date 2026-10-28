import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

async function debug() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tnforest.gov.in', password: 'Admin@TNFMS2026!' }),
  });
  const { data: { token } } = await loginRes.json();

  const userDataDir = path.join(os.tmpdir(), 'chrome-debug-log-' + Date.now());
  const proc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=' + userDataDir,
    'http://localhost:5173',
  ]);
  await new Promise((r) => setTimeout(r, 2000));

  const res = await fetch('http://localhost:9222/json');
  const tabs = await res.json();
  const pageTab = tabs.find((t: any) => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise((r) => {
    ws.onopen = r as any;
  });

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ');
      console.log('[BROWSER CONSOLE]', msg.params.type, ':', text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[BROWSER EXCEPTION THROWN]', JSON.stringify(msg.params.exceptionDetails, null, 2));
    }
  };

  let id = 1;
  const send = (method: string, params: Record<string, any> = {}) =>
    new Promise((resolve) => {
      const myId = id++;
      const handler = (e: any) => {
        const msg = JSON.parse(e.data.toString());
        if (msg.id === myId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');

  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('token', '${token}')`,
  });
  await send('Page.navigate', {
    url: 'http://localhost:5173/changes?zoneId=6ac5a9d496837067de289f3b',
  });
  await new Promise((r) => setTimeout(r, 3500));

  console.log('--- Clicking Change row ---');
  await send('Runtime.evaluate', {
    expression:
      '(() => { const r = Array.from(document.querySelectorAll("table tbody tr")).find(el => el.innerText.includes("CHG-1791379089579-2827")); if (r) r.click(); })()',
  });
  await new Promise((r) => setTimeout(r, 2500));

  console.log('--- Clicking Satellite Imagery button ---');
  await send('Runtime.evaluate', {
    expression:
      '(() => { const b = Array.from(document.querySelectorAll("button")).find(el => el.innerText.trim() === "Satellite Imagery"); if (b) b.click(); })()',
  });
  await new Promise((r) => setTimeout(r, 4000));

  ws.close();
  proc.kill();
  process.exit(0);
}

debug().catch(console.error);
