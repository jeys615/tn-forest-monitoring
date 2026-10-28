const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('10.260016')) {
      const parsed = JSON.parse(line);
      console.log('Found 10.260016 in step:', parsed.step_index);
      const str = JSON.stringify(parsed);
      const idx = str.indexOf('10.260016');
      const slice = str.slice(Math.max(0, idx - 800), Math.min(str.length, idx + 1500));
      fs.writeFileSync('sirumalai_exact_boundary.txt', slice);
      break;
    }
  }
}

main().catch(console.error);
