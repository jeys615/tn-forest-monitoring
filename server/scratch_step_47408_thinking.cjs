const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 47408) {
      console.log('STEP 47408 thinking length:', obj.thinking ? obj.thinking.length : 0);
      if (obj.thinking) {
        fs.writeFileSync('d:/tn-enforcement-system/tn-forest-monitoring/server/step_47408_thinking.md', obj.thinking);
      }
    }
  } catch (e) {}
});
