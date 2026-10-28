const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  let count = 0;
  for await (const line of rl) {
    if (line.includes('6ab5c434f979afc8c8714e25') && line.includes('boundary') && (line.includes('77.') || line.includes('78.'))) {
      const idx = line.indexOf('6ab5c434f979afc8c8714e25');
      const start = Math.max(0, idx - 1000);
      const end = Math.min(line.length, idx + 4000);
      fs.writeFileSync(`sirumalai_coords_${count}.txt`, line.slice(start, end));
      console.log(`Saved sirumalai_coords_${count}.txt`);
      count++;
      if (count >= 3) break;
    }
  }
}

main().catch(console.error);
