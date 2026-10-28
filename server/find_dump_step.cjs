const fs = require('fs');

for (let i = 1; i <= 139; i++) {
  const f = `dump_match_${i}.json`;
  if (!fs.existsSync(f)) continue;
  const raw = fs.readFileSync(f, 'utf8');
  if (raw.includes('6ac642b3540f1518603d0624') && raw.includes('footprint')) {
    try {
      const step = JSON.parse(raw);
      const text = typeof step.content === 'string' ? step.content : JSON.stringify(step);
      if (text.includes('footprint') && text.includes('coordinates')) {
        console.log(`Found candidate in ${f}, step_index: ${step.step_index}`);
        fs.writeFileSync(`found_step_${i}.txt`, text);
      }
    } catch (e) {}
  }
}
