/**
 * Fix remaining organization_id references in SQL strings
 */

import * as fs from 'fs';
import * as path from 'path';

const API_DIR = 'src/api';

const API_FILES = [
  'ai.ts',
  'campaigns.ts',
  'companies.ts',
  'contacts.ts',
  'export.ts',
];

function fixSqlOrganizationId(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nProcessing: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // Pattern: organization_id in SQL strings (not preceded by table alias)
  // Match " organization_id" or "'organization_id" or "`organization_id"
  const pattern = /([\s,])organization_id(\s)/g;

  const matches = content.match(pattern);
  if (matches) {
    content = content.replace(pattern, '$1company_id$2');
    fs.writeFileSync(filePath, content);
    changes = matches.length;
    console.log(`  ✓ Fixed ${changes} organization_id → company_id`);
    return true;
  } else {
    console.log(`  - No organization_id found`);
    return false;
  }
}

console.log('='.repeat(60));
console.log('Fixing organization_id in SQL Strings');
console.log('='.repeat(60));

let totalFixed = 0;
for (const file of API_FILES) {
  if (fixSqlOrganizationId(file)) {
    totalFixed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Fixed ${totalFixed}/${API_FILES.length} files`);
console.log('='.repeat(60));
