import fs from 'fs';
import path from 'path';

const modelsDir = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\src\\models';
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.ts'));

console.log(`Found ${files.length} model files in ${modelsDir}\n`);

for (const file of files) {
  const content = fs.readFileSync(path.join(modelsDir, file), 'utf-8');
  console.log(`=== MODEL FILE: ${file} ===`);
  
  // Extract schema variable name and Schema definition
  const schemaMatch = content.match(/const\s+(\w+Schema)\s*=\s*new\s+Schema<[^>]+>\s*\(([\s\S]*?)\),\s*\n\s*\{/);
  const modelMatch = content.match(/export const (\w+) = model<[^>]+>\('(\w+)',\s*(\w+Schema)(?:,\s*'(\w+)')?\)/);
  
  if (modelMatch) {
    const modelName = modelMatch[1];
    const internalName = modelMatch[2];
    const collectionName = modelMatch[4] || (internalName.toLowerCase() + 's');
    console.log(`Model: ${modelName} | Mongoose: '${internalName}' | Collection: '${collectionName}'`);
  } else {
    console.log(`Model declaration not matched by simple regex`);
  }
}
