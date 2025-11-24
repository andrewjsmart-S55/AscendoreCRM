-- Migration: Standalone AscendoreCRM Schema
-- Description: Create standalone CRM without Overlord dependencies
-- Author: AscendoreCRM
-- Date: 2025-11-22
-- Note: This creates a self-contained CRM system using "companies" instead of "organizations"

-- ============================================================================
-- 1. USERS TABLE (Simplified for Development Mode)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Information
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- ============================================================================
-- 2. COMPANIES TABLE (Top-level multi-tenancy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE,

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON public.companies(deleted_at);

-- ============================================================================
-- 3. COMPANY USERS (Many-to-Many Relationship)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Role (simplified - no complex RBAC for now)
  role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_users_company_id ON public.company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON public.company_users(user_id);
CREATE INDEX IF NOT EXISTS idx_company_users_role ON public.company_users(role);

-- ============================================================================
-- 4. CRM COMPANIES TABLE (customer companies, not to be confused with tenant companies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100),
  industry VARCHAR(100),
  company_size VARCHAR(50) CHECK (company_size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  website VARCHAR(500),

  -- Contact Information
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',

  -- Business Metrics
  annual_revenue DECIMAL(15,2),
  employee_count INTEGER,

  -- Status & Classification
  company_status VARCHAR(50) DEFAULT 'lead' CHECK (company_status IN ('lead', 'prospect', 'customer', 'partner', 'churned', 'inactive')),

  -- Assignment
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Flexible Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_company_id ON public.crm_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_owner_id ON public.crm_companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_company_status ON public.crm_companies(company_status);
CREATE INDEX IF NOT EXISTS idx_crm_companies_industry ON public.crm_companies(industry);
CREATE INDEX IF NOT EXISTS idx_crm_companies_created_at ON public.crm_companies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_companies_deleted_at ON public.crm_companies(deleted_at);
CREATE INDEX IF NOT EXISTS idx_crm_companies_tags ON public.crm_companies USING GIN(tags);

-- ============================================================================
-- 5. CRM CONTACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,

  -- Personal Information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),

  -- Professional Information
  title VARCHAR(100),
  department VARCHAR(100),

  -- Status & Scoring
  contact_status VARCHAR(50) DEFAULT 'active' CHECK (contact_status IN ('active', 'inactive', 'bounced', 'unsubscribed', 'do_not_contact')),
  lead_source VARCHAR(100),
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),

  -- Assignment
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Social & Preferences
  social_profiles JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',

  -- Flexible Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_id ON public.crm_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_crm_company_id ON public.crm_contacts(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner_id ON public.crm_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON public.crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_contact_status ON public.crm_contacts(contact_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead_score ON public.crm_contacts(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_created_at ON public.crm_contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_deleted_at ON public.crm_contacts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tags ON public.crm_contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_name ON public.crm_contacts(last_name, first_name);

-- ============================================================================
-- 6. CRM DEALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  primary_contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'USD',
  stage VARCHAR(50) DEFAULT 'prospecting' CHECK (stage IN ('prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  actual_close_date DATE,
  deal_source VARCHAR(100),
  lost_reason TEXT,
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_company_id ON public.crm_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_crm_company_id ON public.crm_deals(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_primary_contact_id ON public.crm_deals(primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner_id ON public.crm_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals(stage);

-- [Remaining tables: campaigns, projects, tasks, activities, notes, campaign_contacts]
-- [Triggers for updated_at]
-- Note: For brevity, full implementation continues in separate migration files
