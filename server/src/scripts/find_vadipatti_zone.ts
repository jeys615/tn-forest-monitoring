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
    if (line.includes('"ZONE-260913-7787"') && line.includes('"category"')) {
      fs.writeFileSync('src/scripts/vadipatti_zone_line.json', line);
      console.log('Found Vadipatti zone line!');
      break;
    }
  }
}

main().catch(console.error);
