const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 47337 && obj.step_index <= 47408) {
      if (obj.type === 'PLANNER_RESPONSE' && obj.tool_calls) {
        console.log(`Step ${obj.step_index} tool calls:`, obj.tool_calls.map(t => t.name || t.toolName || Object.keys(t)[0]));
      }
      if (line.includes('0.8062') || line.includes('3066242') || line.includes('3,066,242') || line.includes('0.7618077') || line.includes('0.6409')) {
        console.log(`Step ${obj.step_index} MATCH: ${line.substring(0, 150)}`);
      }
    }
  } catch (e) {}
});
