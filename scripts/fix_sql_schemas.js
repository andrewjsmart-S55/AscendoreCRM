/**
 * Fix SQL schema references in API routes
 * - auth.users → public.users
 * - Remove public.profiles references (table doesn't exist)
 * - Replace p.name with CONCAT(u.first_name, ' ', u.last_name)
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

function fixSqlSchemas(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nFixing SQL schemas in: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // 1. Replace auth.users with public.users
  const authUsersPattern = /auth\.users/g;
  const authUsersMatches = content.match(authUsersPattern);
  if (authUsersMatches) {
    content = content.replace(authUsersPattern, 'public.users');
    changes += authUsersMatches.length;
    console.log(`  - Replaced ${authUsersMatches.length} auth.users → public.users`);
  }

  // 2. Remove lines with public.profiles joins
  const profilesPattern = /^\s*LEFT JOIN public\.profiles p ON .+$/gm;
  const profilesMatches = content.match(profilesPattern);
  if (profilesMatches) {
    content = content.replace(profilesPattern, '');
    changes += profilesMatches.length;
    console.log(`  - Removed ${profilesMatches.length} public.profiles references`);
  }

  // 3. Replace p.name with CONCAT(u.first_name, ' ', u.last_name) as owner_name
  // This handles cases like: p.name as owner_name
  const pNamePattern = /p\.name(\s+as\s+\w+)/gi;
  const pNameMatches = content.match(pNamePattern);
  if (pNameMatches) {
    content = content.replace(pNamePattern, "CONCAT(u.first_name, ' ', u.last_name)$1");
    changes += pNameMatches.length;
    console.log(`  - Replaced ${pNameMatches.length} p.name references`);
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Saved ${changes} changes`);
    return true;
  } else {
    console.log(`  - No changes needed`);
    return false;
  }
}

console.log('='.repeat(60));
console.log('Fixing SQL Schema References');
console.log('='.repeat(60));

let totalUpdated = 0;
for (const file of API_FILES) {
  if (fixSqlSchemas(file)) {
    totalUpdated++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Migration complete: ${totalUpdated}/${API_FILES.length} files updated`);
console.log('='.repeat(60));
