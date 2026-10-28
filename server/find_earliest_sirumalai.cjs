const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('6ab5c434f979afc8c8714e25')) {
      const parsed = JSON.parse(line);
      console.log('Earliest mention:', parsed.step_index);
      fs.writeFileSync('sirumalai_earliest.json', JSON.stringify(parsed, null, 2));
      break;
    }
  }
}

main().catch(console.error);
