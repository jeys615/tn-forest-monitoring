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
    if (line.includes('6aa676d32b4fe5808c7e8ded') && line.includes('"type": "Polygon"')) {
      fs.writeFileSync('src/scripts/vadipatti_poly.json', line);
      console.log('Found polygon!');
      break;
    }
  }
}

main().catch(console.error);
