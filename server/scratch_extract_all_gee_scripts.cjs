const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if ([47323, 47325, 47327, 47329, 47331, 47333, 47335].includes(obj.step_index)) {
      console.log(`Extracting script from step ${obj.step_index}, length: ${obj.content.length}`);
      fs.writeFileSync(`d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_${obj.step_index}.js`, obj.content);
    }
  } catch (e) {}
});
