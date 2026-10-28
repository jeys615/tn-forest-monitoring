const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:/Users/jayaseelan/.gemini/antigravity/brain/0fa06343-02c9-4e30-bff2-c98f7b170b82/.system_generated/logs/transcript_full.jsonl';

const rl = readline.createInterface({
  input: fs.createReadStream(transcriptPath),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (line.includes('0.8062') || line.includes('-0.0604') || line.includes('0.7618077') || line.includes('-0.0159835')) {
    try {
      const obj = JSON.parse(line);
      if (obj.step_index < 47818) {
        console.log(`STEP ${obj.step_index} [${obj.source} / ${obj.type}]:`);
        // print a chunk of content around the match
        for (const target of ['0.8062', '-0.0604', '0.7618077', '-0.0159835']) {
          const idx = line.indexOf(target);
          if (idx !== -1) {
            console.log(`MATCH FOR ${target}:`);
            console.log(line.substring(Math.max(0, idx - 200), Math.min(line.length, idx + 400)));
            console.log('===');
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
});
