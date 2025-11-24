"""Set password for dev user."""

import psycopg2
import bcrypt

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "crm_admin",
    "password": "crm_password_2025",
    "database": "ascendore_crm"
}

DEV_USER_EMAIL = "dev@ascendore.local"
DEV_PASSWORD = "DevPassword123!"

def set_dev_password():
    """Set password for dev user."""
    print("=" * 60)
    print("Setting Password for Dev User")
    print("=" * 60)
    print(f"\nEmail: {DEV_USER_EMAIL}")
    print(f"Password: {DEV_PASSWORD}")
    print()

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # Hash the password
        print("Hashing password...")
        password_hash = bcrypt.hashpw(DEV_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        print("[OK] Password hashed")

        # Update the user's password
        print(f"\nUpdating password for {DEV_USER_EMAIL}...")
        cursor.execute(
            """
            UPDATE public.users
            SET password_hash = %s, updated_at = NOW()
            WHERE email = %s
            RETURNING id, email, first_name, last_name;
            """,
            (password_hash, DEV_USER_EMAIL)
        )

        result = cursor.fetchone()

        if result:
            user_id, email, first_name, last_name = result
            print(f"[OK] Password updated for user:")
            print(f"    ID: {user_id}")
            print(f"    Name: {first_name} {last_name}")
            print(f"    Email: {email}")
        else:
            print(f"[ERROR] User not found: {DEV_USER_EMAIL}")
            return 1

        conn.commit()
        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("Dev User Password Set Successfully!")
        print("=" * 60)
        print("\nYou can now login with:")
        print(f"  Email: {DEV_USER_EMAIL}")
        print(f"  Password: {DEV_PASSWORD}")
        print()

    except Exception as e:
        print(f"\n[ERROR] Failed to set password: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0

if __name__ == "__main__":
    exit(set_dev_password())
