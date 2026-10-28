const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl';

const rl = readline.createInterface({
  input: fs.createReadStream(transcriptPath),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (line.includes('3066242') || line.includes('3,066,242') || line.includes('0.8062')) {
    try {
      const obj = JSON.parse(line);
      console.log(`STEP ${obj.step_index} [${obj.source} / ${obj.type}]:`);
      const idx = line.indexOf('3066242') !== -1 ? line.indexOf('3066242') : (line.indexOf('3,066,242') !== -1 ? line.indexOf('3,066,242') : line.indexOf('0.8062'));
      console.log(line.substring(Math.max(0, idx - 200), Math.min(line.length, idx + 400)));
      console.log('===');
    } catch (e) {}
  }
});
