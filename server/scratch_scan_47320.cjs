const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 47320 && obj.step_index <= 47336) {
      console.log(`Step ${obj.step_index}: source=${obj.source}, type=${obj.type}, len=${obj.content?.length || 0}`);
      if (obj.content && (obj.content.includes('GEE') || obj.content.includes('valid_pixels') || obj.content.includes('fast-pass') || obj.content.includes('0.7618') || obj.content.includes('8062'))) {
        console.log(`  Preview: ${obj.content.substring(0, 300).replace(/\n/g, ' ')}`);
      }
    }
  } catch (e) {}
});
