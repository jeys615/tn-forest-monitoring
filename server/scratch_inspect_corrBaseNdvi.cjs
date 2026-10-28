const fs = require('fs');

const content = fs.readFileSync('d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_47325.js', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('corrBaseNdvi'));
console.log(lines.slice(Math.max(0, idx - 30), Math.min(lines.length, idx + 40)).join('\n'));
