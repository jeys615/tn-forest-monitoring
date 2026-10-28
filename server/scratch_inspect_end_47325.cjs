const fs = require('fs');

const content = fs.readFileSync('d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_47325.js', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(Math.max(0, lines.length - 80)).join('\n'));
