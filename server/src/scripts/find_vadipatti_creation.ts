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

  const matching: any[] = [];

  for await (const line of rl) {
    if (line.includes('ZONE-260913-7787') && (line.includes('Zone.create') || line.includes('insertOne') || line.includes('"zoneId": "ZONE-260913-7787"') || line.includes('"zoneId":"ZONE-260913-7787"'))) {
      matching.push(line);
      if (matching.length >= 10) break;
    }
  }

  console.log(`Found ${matching.length} matching lines`);
  fs.writeFileSync('src/scripts/vadipatti_creation_lines.json', JSON.stringify(matching, null, 2));
}

main().catch(console.error);
