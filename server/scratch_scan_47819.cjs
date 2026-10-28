const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 47819 && obj.step_index <= 47920) {
      if (obj.type === 'PLANNER_RESPONSE') {
        console.log(`Step ${obj.step_index} PLANNER_RESPONSE, len=${obj.content?.length || 0}`);
        if (obj.content) {
          const lines = obj.content.split('\n').slice(0, 5).join(' ');
          console.log(`  Start: ${lines}`);
        }
      }
    }
  } catch (e) {}
});
