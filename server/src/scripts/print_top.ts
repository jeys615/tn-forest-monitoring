import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('src/scripts/extracted_step_19185.json', 'utf8'));
console.log(data.content.slice(0, 3000));
