const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  const steps = [];
  for await (const line of rl) {
    if (line.includes('77.95949960074404')) {
      const parsed = JSON.parse(line);
      steps.push(parsed.step_index);
    }
  }
  console.log('Steps with 77.95949960074404:', steps);
}

main().catch(console.error);
