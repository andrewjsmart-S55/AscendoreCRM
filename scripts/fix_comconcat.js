/**
 * Fix comCONCAT issue - restore comp.name
 */

import * as fs from 'fs';
import * as path from 'path';

const API_DIR = 'src/api';

const API_FILES = [
  'ai.ts',
  'campaigns.ts',
  'contacts.ts',
  'deals.ts',
  'export.ts',
  'projects.ts',
];

function fixComConcat(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nFixing: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace comCONCAT(...) back to comp
  const pattern = /comCONCAT\([^)]+\)/g;
  const matches = content.match(pattern);

  if (matches) {
    content = content.replace(pattern, 'comp.name');
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Fixed ${matches.length} occurrences`);
    return true;
  } else {
    console.log(`  - No issues found`);
    return false;
  }
}

console.log('='.repeat(60));
console.log('Fixing comCONCAT → comp.name');
console.log('='.repeat(60));

let totalFixed = 0;
for (const file of API_FILES) {
  if (fixComConcat(file)) {
    totalFixed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Fixed ${totalFixed}/${API_FILES.length} files`);
console.log('='.repeat(60));
