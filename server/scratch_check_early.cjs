const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index < 47408) {
      if (line.includes('0.7618') || line.includes('7618077') || line.includes('0.8062') || line.includes('3066242') || line.includes('3,066,242') || line.includes('-0.0604') || line.includes('159835')) {
        console.log(`STEP ${obj.step_index} [${obj.source} / ${obj.type}]:`);
        console.log(line.substring(0, 500));
        console.log('===');
      }
    }
  } catch (e) {}
});
