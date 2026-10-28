const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('RESERVED_AREA') && !line.includes('find_')) {
      const parsed = JSON.parse(line);
      if (parsed.step_index >= 27000) continue;
      console.log('Found RESERVED_AREA in step:', parsed.step_index);
      const str = JSON.stringify(parsed);
      const idx = str.indexOf('RESERVED_AREA');
      fs.writeFileSync(`reserved_area_step_${parsed.step_index}.txt`, str.slice(Math.max(0, idx - 400), Math.min(str.length, idx + 2000)));
    }
  }
}

main().catch(console.error);
