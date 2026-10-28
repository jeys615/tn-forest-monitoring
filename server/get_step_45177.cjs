const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\jayaseelan\\.gemini\\antigravity\\brain\\0fa06343-02c9-4e30-bff2-c98f7b170b82\\.system_generated\\logs\\transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });

rl.on('line', line => {
  if (line.includes('"step_index":45176') || line.includes('"step_index":45177')) {
    console.log(`Matched step! Length: ${line.length}`);
    fs.writeFileSync('step_45177_full.json', line);
  }
});
