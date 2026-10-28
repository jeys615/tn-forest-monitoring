const fs = require('fs');
const readline = require('readline');

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.includes('write_to_file') && line.includes('6ab5c434f979afc8c8714e25')) {
      const parsed = JSON.parse(line);
      console.log('write_to_file with Sirumalai id in step:', parsed.step_index);
      for (const call of parsed.tool_calls || []) {
        if (call.name === 'write_to_file' && call.args?.CodeContent?.includes('6ab5c434f979afc8c8714e25')) {
          console.log('TargetFile:', call.args.TargetFile);
          if (call.args.CodeContent.includes('coordinates')) {
            console.log('FOUND COORDINATES IN CODE CONTENT!');
            fs.writeFileSync('sirumalai_found_code.txt', call.args.CodeContent);
          }
        }
      }
    }
  }
}

main().catch(console.error);
