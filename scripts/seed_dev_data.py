"""Seed development data for AscendoreCRM standalone database."""

import psycopg2
from psycopg2.extras import execute_values
import sys

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "crm_admin",
    "password": "crm_password_2025",
    "database": "ascendore_crm"
}

# Fixed UUIDs for dev mode
COMPANY_ID = '00000000-0000-0000-0000-000000000001'
USER_ID = '00000000-0000-0000-0000-000000000002'


def seed_data():
    """Seed initial development data."""
    print("=" * 60)
    print("Seeding Development Data")
    print("=" * 60)

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # 1. Create test company (tenant)
        print("\n1. Creating test company (tenant)...")
        cursor.execute("""
            INSERT INTO public.companies (id, name, slug, settings, metadata)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                slug = EXCLUDED.slug
        """, (
            COMPANY_ID,
            'Dev Company',
            'dev-company',
            '{}',
            '{}'
        ))
        print("[OK] Company created")

        # 2. Create test user
        print("\n2. Creating test user...")
        cursor.execute("""
            INSERT INTO public.users (id, email, first_name, last_name, is_active)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (email) DO UPDATE
            SET first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name
        """, (
            USER_ID,
            'dev@ascendore.local',
            'Dev',
            'User',
            True
        ))
        print("[OK] User created")

        # 3. Link user to company
        print("\n3. Linking user to company...")
        cursor.execute("""
            INSERT INTO public.company_users (company_id, user_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (company_id, user_id) DO NOTHING
        """, (
            COMPANY_ID,
            USER_ID,
            'owner'
        ))
        print("[OK] User linked to company")

        # 4. Create sample CRM company (customer)
        print("\n4. Creating sample customer company...")
        cursor.execute("""
            INSERT INTO public.crm_companies (
                company_id, name, slug, industry, company_size,
                company_status, owner_id, tags, custom_fields
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (company_id, slug) DO NOTHING
            RETURNING id
        """, (
            COMPANY_ID,
            'Acme Corporation',
            'acme-corp',
            'Technology',
            'enterprise',
            'customer',
            USER_ID,
            '["enterprise", "technology"]',
            '{}'
        ))
        crm_company_result = cursor.fetchone()
        crm_company_id = crm_company_result[0] if crm_company_result else None
        print(f"[OK] Customer company created: {crm_company_id}")

        # 5. Create sample contact
        if crm_company_id:
            print("\n5. Creating sample contact...")
            cursor.execute("""
                INSERT INTO public.crm_contacts (
                    company_id, crm_company_id, first_name, last_name,
                    email, title, contact_status, lead_score,
                    owner_id, tags
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id, email) DO NOTHING
            """, (
                COMPANY_ID,
                crm_company_id,
                'John',
                'Doe',
                'john.doe@acme.com',
                'CTO',
                'active',
                85,
                USER_ID,
                '["decision-maker"]'
            ))
            print("[OK] Contact created")

        # Commit all changes
        conn.commit()

        print("\n" + "=" * 60)
        print("Seed data created successfully!")
        print("=" * 60)
        print(f"\nDev credentials:")
        print(f"  Company ID: {COMPANY_ID}")
        print(f"  User ID: {USER_ID}")
        print(f"  Email: dev@ascendore.local")

        cursor.close()
        conn.close()

        return True

    except psycopg2.Error as e:
        print(f"\n[ERROR] Database error: {e}")
        return False
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        return False


if __name__ == "__main__":
    success = seed_data()
    sys.exit(0 if success else 1)
