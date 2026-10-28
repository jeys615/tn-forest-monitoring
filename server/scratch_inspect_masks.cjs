const fs = require('fs');

const steps = [47325, 47327, 47329, 47331, 47335];

for (const s of steps) {
  const content = fs.readFileSync(`d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_${s}.js`, 'utf8');
  console.log(`=== STEP ${s} getProductionRadiometricMask ===`);
  const lines = content.split('\n');
  const start = lines.findIndex(l => l.includes('function getProductionRadiometricMask'));
  if (start !== -1) {
    console.log(lines.slice(start, start + 35).join('\n'));
  }
}
