const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (line.includes('136709') || line.includes('136,709')) {
      console.log(`STEP ${obj.step_index} [${obj.source} / ${obj.type}]:`);
      const idx = line.indexOf('136709') !== -1 ? line.indexOf('136709') : line.indexOf('136,709');
      console.log(line.substring(Math.max(0, idx - 100), Math.min(line.length, idx + 200)));
      console.log('===');
    }
  } catch (e) {}
});
