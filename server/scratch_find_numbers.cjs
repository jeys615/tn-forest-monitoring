const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    const keys = ['0.8062', '0.7618077', '-0.0604', '-0.0159835', '0.6409', '3066242', '3,066,242'];
    for (const key of keys) {
      if (line.includes(key)) {
        console.log(`MATCH '${key}' in Step ${obj.step_index} [${obj.source}/${obj.type}]`);
        break;
      }
    }
  } catch (e) {}
});
