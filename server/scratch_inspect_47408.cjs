const fs = require('fs');
const content = fs.readFileSync('d:/tn-enforcement-system/tn-forest-monitoring/server/step_47408_content.md', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('0.8062') || l.includes('3066242') || l.includes('3,066,242') || l.includes('-0.0604')) {
    console.log(`Line ${i+1}: ${l}`);
  }
});
