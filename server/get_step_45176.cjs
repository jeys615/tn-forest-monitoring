const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:\\Users\\jayaseelan\\.gemini\\antigravity\\brain\\0fa06343-02c9-4e30-bff2-c98f7b170b82\\.system_generated\\logs\\transcript_full.jsonl')
});

rl.on('line', line => {
  if (line.includes('"step_index":45176')) {
    const obj = JSON.parse(line);
    console.log(JSON.stringify(obj, null, 2));
  }
});
