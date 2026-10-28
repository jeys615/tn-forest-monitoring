import fs from 'node:fs';
import readline from 'node:readline';

async function main() {
  const fileStream = fs.createReadStream(
    'C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl',
  );

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (parsed.step_index === 25222 || parsed.step_index === 25223) {
      console.log(`Step ${parsed.step_index}:`, JSON.stringify(parsed, null, 2));
      fs.writeFileSync(`step_${parsed.step_index}.json`, JSON.stringify(parsed, null, 2));
    }
  }
}

main().catch(console.error);
