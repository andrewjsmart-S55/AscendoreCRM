/**
 * Disable requireOrganizationRole middleware for dev mode
 */

import * as fs from 'fs';
import * as path from 'path';

const API_DIR = 'src/api';

const API_FILES = [
  'ai.ts',
  'campaigns.ts',
  'companies.ts',
  'contacts.ts',
  'deals.ts',
  'export.ts',
  'import.ts',
  'notes.ts',
  'projects.ts',
  'tasks.ts',
];

function disableRoleMiddleware(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nProcessing: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // Pattern: Find lines like "requireOrganizationRole('member'),"
  // and comment them out
  const pattern = /^(\s+)(requireOrganizationRole\([^)]+\),)$/gm;

  const matches = content.match(pattern);
  if (matches) {
    content = content.replace(pattern, '$1// TODO: Re-enable role check after Phase 3\n$1// $2');
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Commented out ${matches.length} role middleware calls`);
    return true;
  } else {
    console.log(`  - No role middleware found`);
    return false;
  }
}

console.log('='.repeat(60));
console.log('Disabling Role Middleware for Dev Mode');
console.log('='.repeat(60));

let totalFixed = 0;
for (const file of API_FILES) {
  if (disableRoleMiddleware(file)) {
    totalFixed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Fixed ${totalFixed}/${API_FILES.length} files`);
console.log('='.repeat(60));
