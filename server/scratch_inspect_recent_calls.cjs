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
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          const name = tc.name || tc.toolName;
          const args = tc.args || tc.arguments;
          if (name === 'run_command') {
            console.log(`Step ${obj.step_index} run_command: ${args.CommandLine}`);
          } else if (name === 'write_to_file') {
            console.log(`Step ${obj.step_index} write_to_file: ${args.TargetFile}`);
          }
        }
      }
    }
  } catch (e) {}
});
