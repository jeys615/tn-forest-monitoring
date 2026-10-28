const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl';

const rl = readline.createInterface({
  input: fs.createReadStream(transcriptPath),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index < 47408 && (line.includes('136709') || line.includes('136,709') || line.includes('0.7618077') || line.includes('159835'))) {
      console.log(`STEP ${obj.step_index} [${obj.source} / ${obj.type}]:`);
      console.log(line.substring(0, 1000));
      console.log('===');
    }
  } catch (e) {}
});
