const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\jayaseelan\\.gemini\\antigravity\\brain\\0fa06343-02c9-4e30-bff2-c98f7b170b82\\.system_generated\\logs\\transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });

let matchCount = 0;
rl.on('line', line => {
  if (line.includes('COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM')) {
    matchCount++;
    console.log(`Match ${matchCount}, length: ${line.length}`);
    fs.writeFileSync(`dump_match_${matchCount}.json`, line);
  }
});

rl.on('close', () => {
  console.log(`Finished search. Total matches: ${matchCount}`);
});
