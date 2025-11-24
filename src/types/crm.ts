/**
 * CRM Type Definitions for AscendoreCRM
 * Standalone multi-tenancy using companies
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum CompanySize {
  STARTUP = 'startup',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  ENTERPRISE = 'enterprise',
}

export enum CompanyStatus {
  LEAD = 'lead',
  PROSPECT = 'prospect',
  CUSTOMER = 'customer',
  PARTNER = 'partner',
  CHURNED = 'churned',
  INACTIVE = 'inactive',
}

export enum ContactStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BOUNCED = 'bounced',
  UNSUBSCRIBED = 'unsubscribed',
  DO_NOT_CONTACT = 'do_not_contact',
}

export enum DealStage {
  PROSPECTING = 'prospecting',
  QUALIFICATION = 'qualification',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost',
}

export enum CampaignType {
  EMAIL = 'email',
  SOCIAL = 'social',
  WEBINAR = 'webinar',
  EVENT = 'event',
  CONTENT = 'content',
  ADVERTISING = 'advertising',
  OTHER = 'other',
}

export enum CampaignStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ProjectStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskType {
  CALL = 'call',
  EMAIL = 'email',
  MEETING = 'meeting',
  TODO = 'todo',
  FOLLOW_UP = 'follow_up',
  DEMO = 'demo',
  OTHER = 'other',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum RelatedToType {
  COMPANY = 'company',
  CONTACT = 'contact',
  DEAL = 'deal',
  CAMPAIGN = 'campaign',
  PROJECT = 'project',
  NONE = 'none',
}

export enum CampaignContactStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  UNSUBSCRIBED = 'unsubscribed',
}

// ============================================================================
// BASE INTERFACES
// ============================================================================

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface SocialProfiles {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  github?: string;
}

export interface ContactPreferences {
  preferred_contact_method?: 'email' | 'phone' | 'sms';
  email_opt_in?: boolean;
  sms_opt_in?: boolean;
  timezone?: string;
  language?: string;
}

export interface CampaignMetrics {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
  roi?: number;
  open_rate?: number;
  click_through_rate?: number;
}

export interface BaseEntity {
  id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface CompanyScoped {
  company_id: string;
}

export interface Taggable {
  tags: string[];
  custom_fields: Record<string, any>;
}

export interface OwnedEntity {
  owner_id?: string | null;
}

// ============================================================================
// CRM COMPANY
// ============================================================================

export interface CrmCompany extends BaseEntity, CompanyScoped, Taggable, OwnedEntity {
  name: string;
  slug?: string | null;
  industry?: string | null;
  company_size?: CompanySize | null;
  website?: string | null;
  billing_address?: Address;
  shipping_address?: Address;
  annual_revenue?: number | null;
  employee_count?: number | null;
  company_status: CompanyStatus;
  metadata?: Record<string, any>;
}

export interface CreateCrmCompanyInput {
  name: string;
  slug?: string;
  industry?: string;
  company_size?: CompanySize;
  website?: string;
  billing_address?: Address;
  shipping_address?: Address;
  annual_revenue?: number;
  employee_count?: number;
  company_status?: CompanyStatus;
  owner_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateCrmCompanyInput {
  name?: string;
  slug?: string;
  industry?: string;
  company_size?: CompanySize;
  website?: string;
  billing_address?: Address;
  shipping_address?: Address;
  annual_revenue?: number;
  employee_count?: number;
  company_status?: CompanyStatus;
  owner_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

// ============================================================================
// CRM CONTACT
// ============================================================================

export interface CrmContact extends BaseEntity, CompanyScoped, Taggable, OwnedEntity {
  crm_company_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  title?: string | null;
  department?: string | null;
  contact_status: ContactStatus;
  lead_source?: string | null;
  lead_score: number;
  social_profiles?: SocialProfiles;
  preferences?: ContactPreferences;
  metadata?: Record<string, any>;
}

export interface CreateCrmContactInput {
  crm_company_id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  department?: string;
  contact_status?: ContactStatus;
  lead_source?: string;
  lead_score?: number;
  owner_id?: string;
  social_profiles?: SocialProfiles;
  preferences?: ContactPreferences;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateCrmContactInput {
  crm_company_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  department?: string;
  contact_status?: ContactStatus;
  lead_source?: string;
  lead_score?: number;
  owner_id?: string;
  social_profiles?: SocialProfiles;
  preferences?: ContactPreferences;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

// ============================================================================
// CRM DEAL
// ============================================================================

export interface CrmDeal extends BaseEntity, CompanyScoped, Taggable, OwnedEntity {
  crm_company_id?: string | null;
  primary_contact_id?: string | null;
  name: string;
  description?: string | null;
  amount?: number | null;
  currency: string;
  stage: DealStage;
  probability: number;
  expected_close_date?: Date | null;
  actual_close_date?: Date | null;
  deal_source?: string | null;
  lost_reason?: string | null;
  metadata?: Record<string, any>;
}

export interface CreateCrmDealInput {
  crm_company_id?: string;
  primary_contact_id?: string;
  name: string;
  description?: string;
  amount?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expected_close_date?: string | Date;
  deal_source?: string;
  owner_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateCrmDealInput {
  crm_company_id?: string;
  primary_contact_id?: string;
  name?: string;
  description?: string;
  amount?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expected_close_date?: string | Date;
  actual_close_date?: string | Date;
  deal_source?: string;
  lost_reason?: string;
  owner_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

// ============================================================================
// CRM CAMPAIGN
// ============================================================================

export interface CrmCampaign extends BaseEntity, CompanyScoped, Taggable, OwnedEntity {
  name: string;
  description?: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date?: Date | null;
  end_date?: Date | null;
  budget?: number | null;
  actual_cost?: number | null;
  target_audience?: Record<string, any>;
  goals?: Record<string, any>;
  metrics?: CampaignMetrics;
  metadata?: Record<string, any>;
}

export interface CreateCrmCampaignInput {
  name: string;
  description?: string;
  campaign_type: CampaignType;
  status?: CampaignStatus;
  start_date?: string | Date;
  end_date?: string | Date;
  budget?: number;
  actual_cost?: number;
  owner_id?: string;
  target_audience?: Record<string, any>;
  goals?: Record<string, any>;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateCrmCampaignInput {
  name?: string;
  description?: string;
  campaign_type?: CampaignType;
  status?: CampaignStatus;
  start_date?: string | Date;
  end_date?: string | Date;
  budget?: number;
  actual_cost?: number;
  owner_id?: string;
  target_audience?: Record<string, any>;
  goals?: Record<string, any>;
  metrics?: CampaignMetrics;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

// ============================================================================
// CRM PROJECT
// ============================================================================

export interface CrmProject extends BaseEntity, CompanyScoped, Taggable, OwnedEntity {
  crm_company_id?: string | null;
  deal_id?: string | null;
  name: string;
  description?: string | null;
  project_status: ProjectStatus;
  priority: Priority;
  start_date?: Date | null;
  due_date?: Date | null;
  completion_date?: Date | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  project_manager_id?: string | null;
  metadata?: Record<string, any>;
}

export interface CreateCrmProjectInput {
  crm_company_id?: string;
  deal_id?: string;
  name: string;
  description?: string;
  project_status?: ProjectStatus;
  priority?: Priority;
  start_date?: string | Date;
  due_date?: string | Date;
  estimated_hours?: number;
  owner_id?: string;
  project_manager_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateCrmProjectInput {
  crm_company_id?: string;
  deal_id?: string;
  name?: string;
  description?: string;
  project_status?: ProjectStatus;
  priority?: Priority;
  start_date?: string | Date;
  due_date?: string | Date;
  completion_date?: string | Date;
  estimated_hours?: number;
  actual_hours?: number;
  owner_id?: string;
  project_manager_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

// ============================================================================
// CRM TASK
// ============================================================================

export interface CrmTask extends BaseEntity, CompanyScoped, Taggable {
  title: string;
  description?: string | null;
  related_to_type?: RelatedToType | null;
  related_to_id?: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: Priority;
  due_date?: Date | null;
  completed_at?: Date | null;
  assigned_to_id?: string | null;
  created_by_id?: string | null;
  metadata?: Record<string, any>;
}

export interface CreateCrmTaskInput {
  title: string;
  description?: string;
  related_to_type?: RelatedToType;
  related_to_id?: string;
  task_type?: TaskType;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: string | Date;
  assigned_to_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateCrmTaskInput {
  title?: string;
  description?: string;
  related_to_type?: RelatedToType;
  related_to_id?: string;
  task_type?: TaskType;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: string | Date;
  completed_at?: string | Date;
  assigned_to_id?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

// ============================================================================
// CRM ACTIVITY
// ============================================================================

export interface CrmActivity {
  id: string;
  company_id: string;
  activity_type: string;
  entity_type: string;
  entity_id: string;
  description?: string | null;
  user_id?: string | null;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface CreateCrmActivityInput {
  activity_type: string;
  entity_type: string;
  entity_id: string;
  description?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// CRM NOTE
// ============================================================================

export interface CrmNote extends BaseEntity, CompanyScoped {
  content: string;
  related_to_type?: string | null;
  related_to_id?: string | null;
  created_by_id?: string | null;
  is_pinned: boolean;
}

export interface CreateCrmNoteInput {
  content: string;
  related_to_type?: string;
  related_to_id?: string;
  is_pinned?: boolean;
}

export interface UpdateCrmNoteInput {
  content?: string;
  is_pinned?: boolean;
}

// ============================================================================
// CRM CAMPAIGN CONTACT
// ============================================================================

export interface CrmCampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: CampaignContactStatus;
  sent_at?: Date | null;
  opened_at?: Date | null;
  clicked_at?: Date | null;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface AddContactToCampaignInput {
  contact_id: string;
  status?: CampaignContactStatus;
}

export interface UpdateCampaignContactInput {
  status?: CampaignContactStatus;
  sent_at?: string | Date;
  opened_at?: string | Date;
  clicked_at?: string | Date;
}

// ============================================================================
// QUERY FILTERS & PAGINATION
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface CompanyFilters extends PaginationParams {
  company_status?: CompanyStatus;
  industry?: string;
  company_size?: CompanySize;
  owner_id?: string;
  search?: string;
  tags?: string[];
}

export interface ContactFilters extends PaginationParams {
  crm_company_id?: string;
  contact_status?: ContactStatus;
  lead_source?: string;
  owner_id?: string;
  min_lead_score?: number;
  max_lead_score?: number;
  search?: string;
  tags?: string[];
}

export interface DealFilters extends PaginationParams {
  crm_company_id?: string;
  stage?: DealStage;
  owner_id?: string;
  min_amount?: number;
  max_amount?: number;
  currency?: string;
  search?: string;
  tags?: string[];
}

export interface CampaignFilters extends PaginationParams {
  campaign_type?: CampaignType;
  status?: CampaignStatus;
  owner_id?: string;
  search?: string;
  tags?: string[];
}

export interface ProjectFilters extends PaginationParams {
  crm_company_id?: string;
  deal_id?: string;
  project_status?: ProjectStatus;
  priority?: Priority;
  owner_id?: string;
  project_manager_id?: string;
  search?: string;
  tags?: string[];
}

export interface TaskFilters extends PaginationParams {
  related_to_type?: RelatedToType;
  related_to_id?: string;
  task_type?: TaskType;
  status?: TaskStatus;
  priority?: Priority;
  assigned_to_id?: string;
  created_by_id?: string;
  overdue?: boolean;
  search?: string;
  tags?: string[];
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
