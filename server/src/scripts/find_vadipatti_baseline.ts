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
    if (line.includes('6aa679012b4fe5808c7e8ec7') && line.includes('"isActive"')) {
      fs.writeFileSync('src/scripts/vadipatti_baseline.json', line);
      console.log('Found baseline line with isActive!');
      break;
    }
  }
}

main().catch(console.error);
