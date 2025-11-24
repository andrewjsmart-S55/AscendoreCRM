-- Migration: Remaining CRM Tables
-- Description: Add campaigns, projects, tasks, activities, notes, and campaign_contacts
-- Author: AscendoreCRM
-- Date: 2025-11-22

-- ============================================================================
-- 1. CRM CAMPAIGNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Campaign Information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(50) DEFAULT 'email' CHECK (campaign_type IN ('email', 'social', 'webinar', 'event', 'content', 'advertising', 'other')),

  -- Status & Dates
  status VARCHAR(50) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'paused', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,

  -- Budget & Cost
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2),

  -- Assignment
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Campaign Details
  target_audience JSONB DEFAULT '{}',
  goals JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',

  -- Flexible Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_company_id ON public.crm_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_owner_id ON public.crm_campaigns(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON public.crm_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_campaign_type ON public.crm_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_start_date ON public.crm_campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_created_at ON public.crm_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_deleted_at ON public.crm_campaigns(deleted_at);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_tags ON public.crm_campaigns USING GIN(tags);

-- ============================================================================
-- 2. CRM PROJECTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL,

  -- Project Information
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Status & Priority
  project_status VARCHAR(50) DEFAULT 'planning' CHECK (project_status IN ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Dates
  start_date DATE,
  due_date DATE,
  completion_date DATE,

  -- Time Tracking
  estimated_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),

  -- Assignment
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  project_manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Flexible Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_projects_company_id ON public.crm_projects(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_projects_crm_company_id ON public.crm_projects(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_projects_deal_id ON public.crm_projects(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_projects_owner_id ON public.crm_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_projects_project_manager_id ON public.crm_projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_crm_projects_project_status ON public.crm_projects(project_status);
CREATE INDEX IF NOT EXISTS idx_crm_projects_priority ON public.crm_projects(priority);
CREATE INDEX IF NOT EXISTS idx_crm_projects_due_date ON public.crm_projects(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_projects_created_at ON public.crm_projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_projects_deleted_at ON public.crm_projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_crm_projects_tags ON public.crm_projects USING GIN(tags);

-- ============================================================================
-- 3. CRM TASKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Task Information
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Polymorphic Relationship
  related_to_type VARCHAR(50) CHECK (related_to_type IN ('company', 'contact', 'deal', 'campaign', 'project', 'none')),
  related_to_id UUID,

  -- Task Type & Status
  task_type VARCHAR(50) DEFAULT 'todo' CHECK (task_type IN ('call', 'email', 'meeting', 'todo', 'follow_up', 'demo', 'other')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Dates
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Assignment
  assigned_to_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Flexible Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_company_id ON public.crm_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_to_id ON public.crm_tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_created_by_id ON public.crm_tasks(created_by_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON public.crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_priority ON public.crm_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_task_type ON public.crm_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON public.crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_related_to ON public.crm_tasks(related_to_type, related_to_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_created_at ON public.crm_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deleted_at ON public.crm_tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_tags ON public.crm_tasks USING GIN(tags);

-- ============================================================================
-- 4. CRM ACTIVITIES LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Activity Information
  activity_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  description TEXT,

  -- User Attribution
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Additional Context
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_company_id ON public.crm_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_entity ON public.crm_activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_user_id ON public.crm_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_activity_type ON public.crm_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_created_at ON public.crm_activities(created_at DESC);

-- ============================================================================
-- 5. CRM NOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Note Information
  content TEXT NOT NULL,

  -- Polymorphic Relationship
  related_to_type VARCHAR(50),
  related_to_id UUID,

  -- User Attribution
  created_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Pin Status
  is_pinned BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_company_id ON public.crm_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_related_to ON public.crm_notes(related_to_type, related_to_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_created_by_id ON public.crm_notes(created_by_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_is_pinned ON public.crm_notes(is_pinned);
CREATE INDEX IF NOT EXISTS idx_crm_notes_created_at ON public.crm_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_notes_deleted_at ON public.crm_notes(deleted_at);

-- ============================================================================
-- 6. CRM CAMPAIGN CONTACTS TABLE (Many-to-Many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,

  -- Engagement Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed')),

  -- Engagement Timestamps
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_contacts_campaign_id ON public.crm_campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_contacts_contact_id ON public.crm_campaign_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_contacts_status ON public.crm_campaign_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_contacts_sent_at ON public.crm_campaign_contacts(sent_at);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Apply to all tables with updated_at column
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_companies_updated_at
  BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_contacts_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_deals_updated_at
  BEFORE UPDATE ON public.crm_deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_campaigns_updated_at
  BEFORE UPDATE ON public.crm_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_projects_updated_at
  BEFORE UPDATE ON public.crm_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_notes_updated_at
  BEFORE UPDATE ON public.crm_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_campaign_contacts_updated_at
  BEFORE UPDATE ON public.crm_campaign_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.crm_campaigns IS 'CRM campaigns - marketing initiatives';
COMMENT ON TABLE public.crm_projects IS 'CRM projects - customer projects and deliverables';
COMMENT ON TABLE public.crm_tasks IS 'CRM tasks - activities and follow-ups';
COMMENT ON TABLE public.crm_activities IS 'CRM activities log - audit trail for all CRM operations';
COMMENT ON TABLE public.crm_notes IS 'CRM notes - contextual notes on any CRM entity';
COMMENT ON TABLE public.crm_campaign_contacts IS 'CRM campaign contacts - many-to-many relationship with engagement tracking';
