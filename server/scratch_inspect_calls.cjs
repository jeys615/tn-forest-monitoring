const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 47385 && obj.step_index <= 47407) {
      if (obj.tool_calls) {
        console.log(`Step ${obj.step_index}:`, JSON.stringify(obj.tool_calls, null, 2));
      }
    }
  } catch (e) {}
});
