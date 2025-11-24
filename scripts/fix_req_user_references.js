/**
 * Fix req.user references for dev mode
 * Add DEV_USER_ID constant and replace all req.user!.id references
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

function fixReqUserReferences(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nProcessing: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // 1. Add DEV_USER_ID constant if not already present
  if (!content.includes('DEV_USER_ID')) {
    const devCompanyLine = content.indexOf('const DEV_COMPANY_ID');
    if (devCompanyLine > 0) {
      const insertPos = content.indexOf('\n', devCompanyLine) + 1;
      content = content.slice(0, insertPos) +
        'const DEV_USER_ID = \'00000000-0000-0000-0000-000000000002\';\n' +
        content.slice(insertPos);
      changes++;
      console.log(`  + Added DEV_USER_ID constant`);
    }
  }

  // 2. Replace req.user!.id with DEV_USER_ID
  const reqUserIdPattern = /req\.user!\.id/g;
  const matches = content.match(reqUserIdPattern);
  if (matches) {
    content = content.replace(reqUserIdPattern, 'DEV_USER_ID');
    changes += matches.length;
    console.log(`  - Replaced ${matches.length} req.user!.id → DEV_USER_ID`);
  }

  // 3. Replace req.user!.organization!.id with DEV_COMPANY_ID (if any remain)
  const reqUserOrgIdPattern = /req\.user!\.organization!\.id/g;
  const orgMatches = content.match(reqUserOrgIdPattern);
  if (orgMatches) {
    content = content.replace(reqUserOrgIdPattern, 'DEV_COMPANY_ID');
    changes += orgMatches.length;
    console.log(`  - Replaced ${orgMatches.length} req.user!.organization!.id → DEV_COMPANY_ID`);
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
console.log('Fixing req.user References for Dev Mode');
console.log('='.repeat(60));

let totalFixed = 0;
for (const file of API_FILES) {
  if (fixReqUserReferences(file)) {
    totalFixed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Fixed ${totalFixed}/${API_FILES.length} files`);
console.log('='.repeat(60));
