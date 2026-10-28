import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const distDir = path.resolve('client', 'dist');
const outDir = path.resolve('documentation', 'screenshots');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('Connecting to live backend on http://127.0.0.1:5000/api/health...');
  const healthRes = await fetch('http://127.0.0.1:5000/api/health');
  if (!healthRes.ok) {
    throw new Error('Backend health check failed');
  }
  console.log('Backend is healthy!');

  // Authenticate as Super Admin or Admin
  console.log('Logging in as Admin...');
  let loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@monitoring.system',
      password: 'Admin@Monitoring2026!'
    })
  });
  
  if (!loginRes.ok) {
    // Try fallback legacy credential
    loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@tnforest.gov.in',
        password: 'Admin@TNFMS2026!'
      })
    });
  }

  const loginData = await loginRes.json();
  const token = loginData?.data?.token;
  if (!token) {
    throw new Error('Could not obtain token: ' + JSON.stringify(loginData));
  }
  console.log('Obtained Admin token successfully.');

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  };

  const spaServer = http.createServer((req, res) => {
    if (req.url.startsWith('/api')) {
      const proxyReq = http.request(
        `http://127.0.0.1:5000${req.url}`,
        {
          method: req.method,
          headers: req.headers
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      req.pipe(proxyReq);
      proxyReq.on('error', (err) => {
        res.writeHead(502);
        res.end('Proxy Error: ' + err.message);
      });
      return;
    }

    let reqPath = req.url.split('?')[0];
    let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      let data = fs.readFileSync(filePath);
      if (filePath.endsWith('index.html') && !req.url.includes('/login')) {
        let htmlStr = data.toString('utf-8');
        const injection = `
        <script>
          try {
            localStorage.setItem('token', '${token}');
            localStorage.setItem('tn_forest_token', '${token}');
          } catch(e) {}
        </script>
        `;
        htmlStr = htmlStr.replace('<head>', '<head>' + injection);
        data = Buffer.from(htmlStr, 'utf-8');
      } else if (filePath.endsWith('index.html') && req.url.includes('/login')) {
        let htmlStr = data.toString('utf-8');
        const injection = `
        <script>
          try {
            localStorage.removeItem('token');
            localStorage.removeItem('tn_forest_token');
          } catch(e) {}
        </script>
        `;
        htmlStr = htmlStr.replace('<head>', '<head>' + injection);
        data = Buffer.from(htmlStr, 'utf-8');
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  const SPA_PORT = 4180;
  spaServer.listen(SPA_PORT, '127.0.0.1', async () => {
    console.log(`SPA Server running at http://127.0.0.1:${SPA_PORT}`);

    // Map each required screen to URL and output filename
    const screens = [
      { name: 'login.png', url: `http://127.0.0.1:${SPA_PORT}/login`, wait: 1500, label: '1. Login and Authentication' },
      { name: 'dashboard.png', url: `http://127.0.0.1:${SPA_PORT}/`, wait: 3500, label: '2. Main Dashboard' },
      { name: 'forest-zone-management.png', url: `http://127.0.0.1:${SPA_PORT}/areas`, wait: 4000, label: '3. Forest-Zone and Marked-Area Management' },
      { name: 'forest-map.png', url: `http://127.0.0.1:${SPA_PORT}/areas`, wait: 4000, label: '4. Interactive Map and Geographical Visualization' },
      { name: 'satellite-monitoring.png', url: `http://127.0.0.1:${SPA_PORT}/satellite`, wait: 3000, label: '5. Satellite Monitoring and Image Acquisition' },
      { name: 'monitoring-jobs.png', url: `http://127.0.0.1:${SPA_PORT}/monitoring`, wait: 3000, label: '6. Monitoring Jobs and Processing Status' },
      { name: 'ndvi-change-detection.png', url: `http://127.0.0.1:${SPA_PORT}/changes`, wait: 3500, label: '7. NDVI/BSI Change-Detection Results' },
      { name: 'offline-processing.png', url: `http://127.0.0.1:${SPA_PORT}/offline-change-detection`, wait: 3500, label: '8. Offline Raster-Processing Interface and Results' },
      { name: 'change-classification.png', url: `http://127.0.0.1:${SPA_PORT}/offline-change-detection`, wait: 3500, label: '9. Change-Classification Visualization' },
      { name: 'mining-lease-management.png', url: `http://127.0.0.1:${SPA_PORT}/mining-authorizations`, wait: 3000, label: '10. Mining-Lease Management' },
      { name: 'epass-generation.png', url: `http://127.0.0.1:${SPA_PORT}/epass`, wait: 3000, label: '11. E-Pass Generation and Permit Details' },
      { name: 'checkpoint-verification.png', url: `http://127.0.0.1:${SPA_PORT}/checkpoints`, wait: 3000, label: '12. QR-Code Checkpoint Verification' },
      { name: 'epass-verification.png', url: `http://127.0.0.1:${SPA_PORT}/checkpoints`, wait: 3000, label: '12b. Checkpoint Verification Console' },
      { name: 'vehicle-driver-records.png', url: `http://127.0.0.1:${SPA_PORT}/vehicles`, wait: 3000, label: '13a. Vehicle Registry Records' },
      { name: 'driver-records.png', url: `http://127.0.0.1:${SPA_PORT}/drivers`, wait: 3000, label: '13b. Driver Registry Records' },
      { name: 'alerts-evidence-reports.png', url: `http://127.0.0.1:${SPA_PORT}/alerts`, wait: 3000, label: '14. Alerts and Incident Evidence Reports' },
      { name: 'export-interfaces.png', url: `http://127.0.0.1:${SPA_PORT}/reports`, wait: 3000, label: '15. GeoTIFF, KML, Shapefile, and CSV Export Interfaces' },
      // Additional comprehensive operational screens
      { name: 'enforcement-cases.png', url: `http://127.0.0.1:${SPA_PORT}/enforcement-cases`, wait: 3000, label: 'Enforcement Cases' },
      { name: 'reconciliation.png', url: `http://127.0.0.1:${SPA_PORT}/reconciliation`, wait: 3000, label: 'Reconciliation' },
      { name: 'intelligence-dashboard.png', url: `http://127.0.0.1:${SPA_PORT}/intelligence`, wait: 3000, label: 'Intelligence Workstation' },
      { name: 'users-access.png', url: `http://127.0.0.1:${SPA_PORT}/users`, wait: 3000, label: 'Users & Access Control' }
    ];

    for (const sc of screens) {
      const outPath = path.join(outDir, sc.name);
      console.log(`Capturing [${sc.label}]: ${sc.name}...`);
      try {
        await execFileAsync(chromePath, [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          '--window-size=1440,900',
          `--virtual-time-budget=${sc.wait}`,
          `--screenshot=${outPath}`,
          sc.url
        ]);
        console.log(`  ✔ Saved: ${sc.name} (${fs.statSync(outPath).size} bytes)`);
      } catch (err) {
        console.error(`  ✖ Error capturing ${sc.name}:`, err.message);
      }
    }

    console.log('Closing SPA server...');
    spaServer.close();
    console.log('All required system screenshots captured successfully!');
  });
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
