const fs = require('fs');

const content = fs.readFileSync('d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_47325.js', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('GEE INDEPENDENT SCIENTIFIC COMPARISON SUMMARY') || l.includes('Baseline Mean NDVI'));
console.log(lines.slice(Math.max(0, idx - 10), Math.min(lines.length, idx + 60)).join('\n'));
