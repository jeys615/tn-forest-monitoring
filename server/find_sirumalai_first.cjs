const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('ZONE-260925-8986')) {
      const parsed = JSON.parse(line);
      console.log('ZONE-260925-8986 appeared in step:', parsed.step_index);
      // Let's write the first 5 steps where it appeared
      fs.appendFileSync('sirumalai_first_steps.txt', `Step ${parsed.step_index}:\n` + JSON.stringify(parsed).slice(0, 500) + '\n\n');
    }
  }
}

main().catch(console.error);
