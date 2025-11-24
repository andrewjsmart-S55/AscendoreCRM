/**
 * Fix authentication middleware - properly comment it out
 */

import * as fs from 'fs';
import * as path from 'path';

const API_DIR = 'src/api';

const API_FILES = [
  'activities.ts',
  'ai.ts',
  'analytics.ts',
  'campaigns.ts',
  'companies.ts',
  'contacts.ts',
  'deals.ts',
  'export.ts',
  'import.ts',
  'notes.ts',
  'projects.ts',
  'search.ts',
  'tasks.ts',
];

function fixAuthMiddleware(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nFixing auth in: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');

  // Pattern: Find lines like "contactsRouter.use(authenticate); // TODO: Re-enable auth"
  // Replace with: "// TODO: Re-enable auth after Phase 3\n// contactsRouter.use(authenticate);"
  const pattern = /^(.+Router\.use\(authenticate\);)\s*(\/\/\s*TODO:.+)?$/gm;

  const matches = content.match(pattern);
  if (matches) {
    // Replace the pattern
    content = content.replace(
      pattern,
      '// TODO: Re-enable auth after Phase 3\n// $1'
    );

    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Fixed authentication middleware`);
    return true;
  } else {
    console.log(`  - No active auth middleware found`);
    return false;
  }
}

console.log('='.repeat(60));
console.log('Fixing Authentication Middleware');
console.log('='.repeat(60));

let totalFixed = 0;
for (const file of API_FILES) {
  if (fixAuthMiddleware(file)) {
    totalFixed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Fixed ${totalFixed}/${API_FILES.length} files`);
console.log('='.repeat(60));
