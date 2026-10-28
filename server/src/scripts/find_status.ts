import fs from 'fs';
import path from 'path';

function scanDir(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        scanDir(fullPath, fileList);
      }
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const rootDirs = ['shared', 'server/src', 'client/src'];
const cutoff = Date.now() - 24 * 60 * 60 * 1000;

console.log('Files modified in the last 24 hours:');
for (const r of rootDirs) {
  const files = scanDir(r);
  for (const f of files) {
    const stat = fs.statSync(f);
    if (stat.mtimeMs > cutoff) {
      console.log(`  ${new Date(stat.mtimeMs).toISOString()} - ${f}`);
    }
  }
}

