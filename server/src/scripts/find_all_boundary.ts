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
    if (line.includes('6ab5c434f979afc8c8714e25') && line.includes('boundary') && !line.includes('extract_') && !line.includes('find_')) {
      const parsed = JSON.parse(line);
      console.log(`Step ${parsed.step_index} (${parsed.type}):`, line.slice(0, 300));
      fs.appendFileSync('boundary_matches.txt', `Step ${parsed.step_index}:\n` + line + '\n\n');
    }
  }
}

main().catch(console.error);
