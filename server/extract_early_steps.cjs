const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (parsed.step_index === 23570 || parsed.step_index === 23571) {
      console.log(`Writing step_${parsed.step_index}.json`);
      fs.writeFileSync(`step_${parsed.step_index}.json`, JSON.stringify(parsed, null, 2));
    }
  }
}

main().catch(console.error);
