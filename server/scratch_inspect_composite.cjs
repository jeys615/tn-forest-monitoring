const fs = require('fs');

for (const s of [47325, 47327, 47329, 47331, 47335]) {
  const content = fs.readFileSync(`d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_${s}.js`, 'utf8');
  console.log(`=== STEP ${s} corrComposite ===`);
  const lines = content.split('\n');
  const matching = lines.filter(l => l.includes('corrComposite') || l.includes('corrStats') || l.includes('base_ndvi') || l.includes('cur_ndvi'));
  matching.slice(0, 10).forEach(l => console.log('  ', l.trim()));
}
