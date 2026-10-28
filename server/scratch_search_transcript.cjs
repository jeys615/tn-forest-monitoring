const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript.jsonl';

const rl = readline.createInterface({
  input: fs.createReadStream(transcriptPath),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (line.includes('8062') || line.includes('0604') || line.includes('7618077') || line.includes('159835')) {
    try {
      const obj = JSON.parse(line);
      console.log(`STEP ${obj.step_index} [${obj.source} / ${obj.type}]:`);
      console.log(line.substring(0, 500));
      console.log('---');
    } catch (e) {
      // ignore
    }
  }
});
