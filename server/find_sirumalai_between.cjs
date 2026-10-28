const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('Sirumalai') || line.includes('sirumalai')) {
      const parsed = JSON.parse(line);
      if (parsed.step_index >= 23414 && parsed.step_index < 23575) {
        console.log('Found Sirumalai in step:', parsed.step_index);
        fs.writeFileSync(`sirumalai_creation_step_${parsed.step_index}.json`, JSON.stringify(parsed, null, 2));
      }
    }
  }
}

main().catch(console.error);
