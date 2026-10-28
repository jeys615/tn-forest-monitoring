const fs = require('fs');
const content = fs.readFileSync('../client/src/pages/changes/ChangesPage.tsx', 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<button')) {
    // Look ahead 20 lines for onClick or type="submit"
    const chunk = lines.slice(i, Math.min(lines.length, i + 25)).join('\n');
    const hasOnClick = chunk.includes('onClick=');
    const hasSubmit = chunk.includes('type="submit"');
    if (!hasOnClick && !hasSubmit) {
      console.log(`Missing onClick at line ${i + 1}:`);
      console.log(lines.slice(i, i + 10).join('\n'));
      console.log('-----------------------------------');
    }
  }
}
