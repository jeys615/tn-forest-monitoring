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
    if (obj.step_index >= 47325 && obj.step_index <= 47336) {
      console.log(`\n================ STEP ${obj.step_index} [${obj.source} / ${obj.type}] ================`);
      if (obj.content) {
        console.log(obj.content.substring(0, 1500));
      }
    }
  } catch (e) {}
});
