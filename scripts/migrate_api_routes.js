/**
 * Migrate API routes from Overlord to Standalone schema
 * - organization_id → company_id (tenant)
 * - c.company_id → c.crm_company_id (customer company)
 * - Simplify auth for dev mode
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

function migrateFile(filename) {
  const filePath = path.join(API_DIR, filename);
  console.log(`\nMigrating: ${filename}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // 1. Update SQL field references: organization_id → company_id (tenant)
  const orgIdPattern = /(\w+\.)organization_id/g;
  const orgIdMatches = content.match(orgIdPattern);
  if (orgIdMatches) {
    content = content.replace(orgIdPattern, '$1company_id');
    changes += orgIdMatches.length;
    console.log(`  - Replaced ${orgIdMatches.length} organization_id references`);
  }

  // 2. Update SQL field references: c.company_id → c.crm_company_id (customer company)
  // Only for crm_contacts, crm_deals, crm_projects tables
  const customerCompanyPattern = /([cp]\.)(company_id)(?!\s*=\s*\$1)/g;
  const customerCompanyMatches = content.match(customerCompanyPattern);
  if (customerCompanyMatches && !filename.includes('companies.ts')) {
    content = content.replace(customerCompanyPattern, '$1crm_company_id');
    changes += customerCompanyMatches.length;
    console.log(`  - Replaced ${customerCompanyMatches.length} company_id → crm_company_id`);
  }

  // 3. Update auth references: req.user!.organization!.id → DEV_COMPANY_ID
  const userOrgPattern = /req\.user!\.organization!\.id/g;
  const userOrgMatches = content.match(userOrgPattern);
  if (userOrgMatches) {
    // Add DEV_COMPANY_ID constant at top if not present
    if (!content.includes('DEV_COMPANY_ID')) {
      const importEnd = content.indexOf('\nexport const');
      if (importEnd > 0) {
        content = content.slice(0, importEnd) +
          '\n\n// Dev mode: Mock company ID\nconst DEV_COMPANY_ID = \'00000000-0000-0000-0000-000000000001\';\n' +
          content.slice(importEnd);
      }
    }
    content = content.replace(userOrgPattern, 'DEV_COMPANY_ID');
    changes += userOrgMatches.length;
    console.log(`  - Replaced ${userOrgMatches.length} user.organization.id references`);
  }

  // 4. Comment out authentication middleware
  const authUsePattern = /^\s*\w+Router\.use\(authenticate\);$/gm;
  const authUseMatches = content.match(authUsePattern);
  if (authUseMatches) {
    content = content.replace(authUsePattern, '// $& // TODO: Re-enable auth after Phase 3');
    changes += authUseMatches.length;
    console.log(`  - Commented out ${authUseMatches.length} auth middleware`);
  }

  // 5. Update filter field: company_id in query params (where it refers to customer company)
  if (!filename.includes('companies.ts')) {
    const filterPattern = /company_id: req\.query\.company_id/g;
    const filterMatches = content.match(filterPattern);
    if (filterMatches) {
      content = content.replace(filterPattern, 'crm_company_id: req.query.crm_company_id');
      changes += filterMatches.length;
      console.log(`  - Updated ${filterMatches.length} filter parameters`);
    }
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
console.log('Migrating API Routes: Overlord → Standalone');
console.log('='.repeat(60));

let totalUpdated = 0;
for (const file of API_FILES) {
  if (migrateFile(file)) {
    totalUpdated++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Migration complete: ${totalUpdated}/${API_FILES.length} files updated`);
console.log('='.repeat(60));
