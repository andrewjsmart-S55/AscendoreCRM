"""Enable authentication on all CRM API routes."""

import re
from pathlib import Path

# Files to update
FILES = [
    'src/api/companies.ts',
    'src/api/tasks.ts',
    'src/api/projects.ts',
    'src/api/notes.ts',
    'src/api/import.ts',
    'src/api/export.ts',
    'src/api/deals.ts',
    'src/api/campaigns.ts',
    'src/api/ai.ts',
    'src/api/activities.ts',
    'src/api/analytics.ts',
    'src/api/search.ts',
]

def process_file(filepath: str):
    """Process a single TypeScript file to enable auth."""
    print(f"\nProcessing: {filepath}")

    path = Path(filepath)
    if not path.exists():
        print(f"  [SKIP] File not found")
        return

    content = path.read_text(encoding='utf-8')
    original_content = content

    # Remove DEV constant definitions
    content = re.sub(
        r"// Dev mode: Mock company ID\s*\nconst DEV_COMPANY_ID = '[^']+';(\s*\nconst DEV_USER_ID = '[^']+';)?",
        '',
        content
    )

    # Enable authentication middleware - pattern 1: commented out use(authenticate)
    content = re.sub(
        r"// TODO: Re-enable auth after Phase 3\s*\n// (?:TODO: Re-enable auth after Phase 3\s*\n)?// // (\w+Router)\.use\(authenticate\)",
        r"\1.use(authenticate);",
        content
    )

    # Enable authentication middleware - pattern 2: at router creation
    content = re.sub(
        r"(export const \w+Router = Router\(\);)\s*\n// TODO: Re-enable auth after Phase 3",
        r"\1\n\n// Enable authentication for all routes\n\1.split(' = ')[0].replace('export const ', '').replace('Router', 'Router').use(authenticate);",
        content
    )

    # Better pattern for enabling authentication
    if '// TODO: Re-enable auth' in content or '// // ' in content:
        # Find the router name
        router_match = re.search(r'export const (\w+Router) = Router\(\);', content)
        if router_match:
            router_name = router_match.group(1)
            # Remove TODO comments and add proper authentication
            content = re.sub(
                r"// TODO: Re-enable auth.*?\n(?:// .*?\n)*",
                f"\n// Enable authentication for all routes\n{router_name}.use(authenticate);\n",
                content
            )

    # Replace DEV_COMPANY_ID with req.user!.organization!.id
    content = content.replace('DEV_COMPANY_ID', 'req.user!.organization!.id')

    # Replace DEV_USER_ID with req.user!.id
    content = content.replace('DEV_USER_ID', 'req.user!.id')

    if content != original_content:
        path.write_text(content, encoding='utf-8')
        print(f"  [OK] Updated")
    else:
        print(f"  [SKIP] No changes needed")

def main():
    """Process all files."""
    print("=" * 60)
    print("Enabling Authentication on CRM API Routes")
    print("=" * 60)

    for filepath in FILES:
        process_file(filepath)

    print("\n" + "=" * 60)
    print("Authentication Enabled on All Routes")
    print("=" * 60)

if __name__ == '__main__':
    main()
