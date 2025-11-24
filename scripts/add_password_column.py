"""Add password_hash column to users table."""

import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "crm_admin",
    "password": "crm_password_2025",
    "database": "ascendore_crm"
}

def add_password_column():
    """Add password_hash column to users table."""
    print("=" * 60)
    print("Adding password_hash Column to Users Table")
    print("=" * 60)

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # Add password_hash column
        print("\nAdding password_hash column...")
        cursor.execute("""
            ALTER TABLE public.users 
            ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
        """)
        
        print("[OK] password_hash column added")

        # Add indexes for performance
        print("\nAdding index on email...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_email 
            ON public.users(email);
        """)
        print("[OK] Email index created")

        conn.commit()
        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0

if __name__ == "__main__":
    exit(add_password_column())
