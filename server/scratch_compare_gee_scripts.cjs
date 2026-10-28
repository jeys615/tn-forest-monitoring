const fs = require('fs');

const steps = [47323, 47325, 47327, 47329, 47331, 47333, 47335];

for (const s of steps) {
  const content = fs.readFileSync(`d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_${s}.js`, 'utf8');
  console.log(`=== STEP ${s} ===`);
  
  // Find valid mask logic
  const lines = content.split('\n');
  const maskLines = lines.filter(l => l.includes('validComparisonMask') || l.includes('baseValid') || l.includes('curValid') || l.includes('qaMask') || l.includes('sclMask'));
  console.log('Mask lines:');
  maskLines.slice(0, 5).forEach(l => console.log('  ', l.trim()));
  
  // Find reducers
  const reducerLines = lines.filter(l => l.includes('ee.Reducer') || l.includes('reduceRegion'));
  console.log('Reducer lines:');
  reducerLines.forEach(l => console.log('  ', l.trim()));
  console.log('-------------------------------------------');
}
