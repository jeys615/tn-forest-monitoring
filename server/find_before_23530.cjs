const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.toLowerCase().includes('sirumalai')) {
      const parsed = JSON.parse(line);
      if (parsed.step_index < 23530) {
        console.log('Found Sirumalai before 23530 in step:', parsed.step_index);
        const str = JSON.stringify(parsed);
        fs.writeFileSync(`sirumalai_text_step_${parsed.step_index}.txt`, str.slice(0, 1000));
      }
    }
  }
}

main().catch(console.error);
