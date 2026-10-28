const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\jayaseelan\\.gemini\\antigravity\\brain\\0fa06343-02c9-4e30-bff2-c98f7b170b82\\.system_generated\\logs\\transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });

let count = 0;
rl.on('line', line => {
  if (line.includes('6ac642b3540f1518603d0624') && line.includes('satellitemetadatas') && line.includes('insertOne')) {
    console.log(`Found insert/restore match, length ${line.length}`);
    fs.writeFileSync('restore_source.json', line);
  }
  if (line.includes('6ac642b3540f1518603d0624') && line.includes('SatelliteMetadata') && (line.includes('create(') || line.includes('insertMany('))) {
    console.log(`Found Mongoose insert match, length ${line.length}`);
    fs.writeFileSync('restore_source_mongoose.json', line);
  }
});

rl.on('close', () => {
  console.log('Search completed.');
});
