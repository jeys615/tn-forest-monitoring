const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('77.95949960074404') && !line.includes('find_full_poly') && !line.includes('find_coords')) {
      const parsed = JSON.parse(line);
      if (parsed.step_index >= 27000) continue;
      const str = JSON.stringify(parsed);
      const idx = str.indexOf('77.95949960074404');
      const start = Math.max(0, idx - 200);
      const end = Math.min(str.length, idx + 2500);
      console.log('Step:', parsed.step_index);
      fs.writeFileSync('sirumalai_coordinates_clean.txt', str.slice(start, end));
      break;
    }
  }
}

main().catch(console.error);
