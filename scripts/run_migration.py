"""Run database migrations for AscendoreCRM."""

import psycopg2
import sys
from pathlib import Path

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "crm_admin",
    "password": "crm_password_2025",
    "database": "ascendore_crm"
}


def run_migration(migration_file: str):
    """Run a specific migration file."""
    print(f"\nRunning migration: {migration_file}")
    print("=" * 60)

    # Read migration file
    migration_path = Path(migration_file)
    if not migration_path.exists():
        print(f"[ERROR] Migration file not found: {migration_file}")
        return False

    with open(migration_path, 'r') as f:
        sql = f.read()

    try:
        # Connect to database
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # Execute migration
        print("Executing migration SQL...")
        cursor.execute(sql)
        conn.commit()

        print("[OK] Migration completed successfully!")

        cursor.close()
        conn.close()

        return True

    except psycopg2.Error as e:
        print(f"[ERROR] Database error: {e}")
        return False
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        return False


if __name__ == "__main__":
    migration_file = "migrations/002_standalone_schema.sql"

    if len(sys.argv) > 1:
        migration_file = sys.argv[1]

    success = run_migration(migration_file)
    sys.exit(0 if success else 1)
