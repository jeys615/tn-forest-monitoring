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
    if (line.includes('"step_index":19185')) {
      const data = JSON.parse(line);
      fs.writeFileSync('src/scripts/extracted_step_19185.json', JSON.stringify(data, null, 2));
      console.log('Saved step 19185!');
      break;
    }
  }
}

main().catch(console.error);
