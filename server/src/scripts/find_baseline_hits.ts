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

  let count = 0;
  for await (const line of rl) {
    if (line.includes('6aa679012b4fe5808c7e8ec7')) {
      console.log(`[Line ${count}] length: ${line.length}`);
      fs.writeFileSync(`src/scripts/baseline_hit_${count}.json`, line);
      count++;
      if (count >= 5) break;
    }
  }
}

main().catch(console.error);
