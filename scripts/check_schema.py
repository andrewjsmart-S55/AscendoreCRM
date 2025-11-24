"""Check database schema."""

import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "crm_admin",
    "password": "crm_password_2025",
    "database": "ascendore_crm"
}

def check_schema():
    """Check database schema."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # Check users table
        print("=" * 60)
        print("USERS TABLE STRUCTURE")
        print("=" * 60)
        cursor.execute("""
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users'
            ORDER BY ordinal_position;
        """)
        for row in cursor.fetchall():
            print(f"  {row[0]:<30} {row[1]:<20} {row[2] or ''}")

        # Check companies table
        print("\n" + "=" * 60)
        print("COMPANIES TABLE STRUCTURE")
        print("=" * 60)
        cursor.execute("""
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'companies'
            ORDER BY ordinal_position;
        """)
        for row in cursor.fetchall():
            print(f"  {row[0]:<30} {row[1]:<20} {row[2] or ''}")

        # Check company_users table
        print("\n" + "=" * 60)
        print("COMPANY_USERS TABLE STRUCTURE")
        print("=" * 60)
        cursor.execute("""
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'company_users'
            ORDER BY ordinal_position;
        """)
        for row in cursor.fetchall():
            print(f"  {row[0]:<30} {row[1]:<20} {row[2] or ''}")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n[ERROR] Failed to check schema: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0

if __name__ == "__main__":
    exit(check_schema())
