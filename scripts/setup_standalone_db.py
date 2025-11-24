"""Setup standalone AscendoreCRM database."""

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import sys

# Configuration
POSTGRES_HOST = "localhost"
POSTGRES_PORT = 5432
POSTGRES_USER = "postgres"
POSTGRES_PASSWORD = "postgres"

NEW_DB_NAME = "ascendore_crm"
NEW_DB_USER = "crm_admin"
NEW_DB_PASSWORD = "crm_password_2025"


def create_database():
    """Create the standalone AscendoreCRM database."""
    print("=" * 60)
    print("Setting up standalone AscendoreCRM database")
    print("=" * 60)

    try:
        # Connect to postgres database to create new database
        conn = psycopg2.connect(
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # Check if database exists
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (NEW_DB_NAME,)
        )
        exists = cursor.fetchone()

        if exists:
            print(f"\nDatabase '{NEW_DB_NAME}' already exists. Dropping...")
            # Terminate existing connections
            cursor.execute(f"""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{NEW_DB_NAME}'
                AND pid <> pg_backend_pid()
            """)
            cursor.execute(sql.SQL("DROP DATABASE {}").format(
                sql.Identifier(NEW_DB_NAME)
            ))
            print(f"Dropped existing database '{NEW_DB_NAME}'")

        # Create new database
        print(f"\nCreating database '{NEW_DB_NAME}'...")
        cursor.execute(sql.SQL("CREATE DATABASE {}").format(
            sql.Identifier(NEW_DB_NAME)
        ))
        print(f"[OK] Database '{NEW_DB_NAME}' created successfully")

        # Check if user exists
        cursor.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s",
            (NEW_DB_USER,)
        )
        user_exists = cursor.fetchone()

        if not user_exists:
            # Create database user
            print(f"\nCreating user '{NEW_DB_USER}'...")
            cursor.execute(sql.SQL("CREATE USER {} WITH PASSWORD %s").format(
                sql.Identifier(NEW_DB_USER)
            ), (NEW_DB_PASSWORD,))
            print(f"[OK] User '{NEW_DB_USER}' created successfully")
        else:
            print(f"\nUser '{NEW_DB_USER}' already exists")

        # Grant database privileges
        print(f"\nGranting database privileges to '{NEW_DB_USER}'...")
        cursor.execute(sql.SQL("GRANT ALL PRIVILEGES ON DATABASE {} TO {}").format(
            sql.Identifier(NEW_DB_NAME),
            sql.Identifier(NEW_DB_USER)
        ))

        # Connect to new database to grant schema privileges
        cursor.close()
        conn.close()

        conn = psycopg2.connect(
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=NEW_DB_NAME
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # Grant schema privileges
        print(f"Granting schema privileges...")
        cursor.execute(sql.SQL("GRANT ALL ON SCHEMA public TO {}").format(
            sql.Identifier(NEW_DB_USER)
        ))
        cursor.execute(sql.SQL("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {}").format(
            sql.Identifier(NEW_DB_USER)
        ))
        cursor.execute(sql.SQL("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {}").format(
            sql.Identifier(NEW_DB_USER)
        ))

        print(f"[OK] All privileges granted successfully")

        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("Database setup completed successfully!")
        print("=" * 60)
        print(f"\nConnection details:")
        print(f"  Database: {NEW_DB_NAME}")
        print(f"  User: {NEW_DB_USER}")
        print(f"  Password: {NEW_DB_PASSWORD}")
        print(f"  Host: {POSTGRES_HOST}")
        print(f"  Port: {POSTGRES_PORT}")
        print(f"\nConnection string:")
        print(f"  postgresql://{NEW_DB_USER}:{NEW_DB_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{NEW_DB_NAME}")

        return True

    except psycopg2.Error as e:
        print(f"\n[ERROR] Database error: {e}")
        return False
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        return False


if __name__ == "__main__":
    success = create_database()
    sys.exit(0 if success else 1)
