# AscendoreCRM

A modern CRM system built on the Overlord Platform, leveraging enterprise-grade AI capabilities and multi-tenancy.

## Overview

AscendoreCRM is a comprehensive Customer Relationship Management system that integrates with the Overlord Platform to provide:

- **Multi-tenant Architecture**: Secure organization-based data isolation
- **AI-Powered Features**: Lead scoring, insights, and automation using AWS Bedrock
- **Real-time Updates**: WebSocket-based live data synchronization
- **Enterprise Security**: Row-level security, JWT authentication, and role-based access control

## Core Entities

- **Companies**: Manage customer organizations and prospects
- **Contacts**: Track individuals and their relationships
- **Deals**: Monitor sales pipeline and opportunities
- **Campaigns**: Plan and execute marketing initiatives
- **Projects**: Coordinate customer projects and deliverables
- **Tasks**: Organize activities and follow-ups

## Technology Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL with pgvector
- **Caching**: Redis
- **AI**: AWS Bedrock (Claude)
- **Auth**: Supabase GoTrue
- **Real-time**: Supabase Realtime
- **Storage**: AWS S3
- **Infrastructure**: AWS ECS Fargate

## Platform Integration

AscendoreCRM leverages the Overlord Platform located at `C:\Users\AndrewSmart\Claude_Projects\Overlord` for:
- Authentication and user management
- Multi-tenancy infrastructure
- AI service integrations
- File storage and management
- Real-time subscriptions
- Billing and payments (Stripe)

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/andrewjsmart-S55/AscendoreCRM.git
cd AscendoreCRM

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Run database migration
psql -U postgres -d overlord -f migrations/001_crm_foundation.sql
```

### Development

```bash
npm run dev
```

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## Project Status

### Phase 1: Foundation ✅ COMPLETE

- [x] Database schema and migrations
- [x] TypeScript type definitions
- [x] Zod validation schemas
- [x] Project configuration
- [x] Documentation

See [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) for details.

### Phase 2: API Development ✅ COMPLETE

- [x] Express server setup
- [x] Companies API endpoints
- [x] Contacts API endpoints
- [x] Deals API endpoints
- [x] Tasks API endpoints
- [x] Notes API
- [x] Activity logging middleware

See [PHASE2_COMPLETE.md](./PHASE2_COMPLETE.md) for details.

### Phase 3: Advanced Features (Next)

- [ ] Campaigns API endpoints
- [ ] Projects API endpoints
- [ ] Advanced search
- [ ] Bulk operations
- [ ] Analytics & reporting

See [Implementation Plan](https://github.com/andrewjsmart-S55/AscendoreCRM/issues/1) for full roadmap.

## Architecture

AscendoreCRM runs on the same PostgreSQL database as Overlord Platform to leverage:
- Multi-tenancy infrastructure
- Authentication and user management
- Row-level security policies
- Organization membership

API endpoints are prefixed with `/api/v1/a-crm/` to avoid conflicts.

## License

MIT
