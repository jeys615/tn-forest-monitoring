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
    if (obj.step_index === 47335) {
      fs.writeFileSync('d:/tn-enforcement-system/tn-forest-monitoring/server/gee_script_step_47335.js', obj.content);
      console.log('Extracted GEE script from step 47335, length:', obj.content.length);
    }
  } catch (e) {}
});
