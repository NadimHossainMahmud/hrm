# HRForge — HR SaaS Platform Architecture Document

**Version:** 1.0.0

**Stack:** Next.js (Frontend) · Express.js (Backend) · PostgreSQL · Redis · S3

**Author:** Architecture Team

**Date:** March 2026

---

## 1. Executive Summary

HRForge is a multi-tenant HR SaaS platform designed to serve SMBs and mid-market companies (10–5,000 employees). It provides a unified system covering the entire employee lifecycle — from hiring and onboarding through performance management, compensation, compliance, and offboarding. The platform is tiered into three plans (Core, Pro, Elite) with feature gating at the API level.

This document defines the full technical architecture: system design, database schema, API surface, service boundaries, infrastructure, security model, and deployment strategy.

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│  Next.js App (SSR + CSR) — Vercel / Self-hosted                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Dashboard │ │  Admin   │ │ Employee │ │  Mobile  │              │
│  │  Portal   │ │  Portal  │ │Self-Serve│ │  (PWA)   │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTPS / WSS
┌────────────────────────▼────────────────────────────────────────────┐
│                     API GATEWAY / LOAD BALANCER                     │
│              (Nginx / AWS ALB + Rate Limiting + WAF)                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                     EXPRESS.JS API LAYER                             │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Auth &     │  │  Core HR     │  │  Hiring &    │              │
│  │  Tenancy    │  │  Service     │  │  ATS Service │              │
│  └─────────────┘  └──────────────┘  └──────────────┘              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Performance │  │ Compensation │  │  Time Off &  │              │
│  │  Mgmt       │  │  Service     │  │  Benefits    │              │
│  └─────────────┘  └──────────────┘  └──────────────┘              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Compliance  │  │  Community   │  │  Analytics   │              │
│  │  & Training │  │  Service     │  │  & Reports   │              │
│  └─────────────┘  └──────────────┘  └──────────────┘              │
│  ┌─────────────┐  ┌──────────────┐                                 │
│  │  AI / HR    │  │ Notification │                                 │
│  │ Intelligence│  │  Service     │                                 │
│  └─────────────┘  └──────────────┘                                 │
└───┬──────────┬──────────┬──────────┬───────────────────────────────┘
    │          │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│Postgre│ │ Redis │ │  S3   │ │ Queue │
│  SQL   │ │Cache/ │ │Object │ │BullMQ │
│(Primary│ │Session│ │Storage│ │(Jobs) │
│  + RR) │ │       │ │       │ │       │
└────────┘ └───────┘ └───────┘ └───────┘
```

### 2.2 Architecture Principles

1. **Multi-tenancy via Row-Level Security (RLS):** Every table carries a `tenant_id`. PostgreSQL RLS policies enforce isolation at the database level. No schema-per-tenant — single shared schema for operational simplicity.
2. **Feature gating at middleware:** A `planGate('feature_key')` middleware checks the tenant's subscription tier before allowing access to any gated endpoint.
3. **Modular monolith first, microservices later:** Start as a well-structured modular monolith within Express. Each domain module has clear boundaries. Extract into services only when scale demands it.
4. **Event-driven for async work:** Background jobs (emails, PDF generation, AI processing, report building) go through BullMQ backed by Redis. Critical domain events emit to an internal event bus for cross-module communication.
5. **API-first design:** Every feature is exposed through a versioned REST API, making it possible to build mobile apps, integrations, and public APIs on the same foundation.

---

## 3. Tech Stack — Detailed Breakdown

### 3.1 Frontend

| Layer | Technology | Rationale |
| --- | --- | --- |
| Framework | Next.js 14+ (App Router) | SSR for SEO (marketing), RSC for dashboard perf |
| State | Zustand + TanStack Query | Zustand for client state, TanStack for server state/cache |
| UI Library | shadcn/ui + Tailwind CSS | Composable, accessible, consistent design system |
| Forms | React Hook Form + Zod | Type-safe validation shared with backend |
| Rich Text | Tiptap | For announcements, offer letters, policies |
| Charts | Recharts + D3 | Recharts for dashboards, D3 for advanced visualizations |
| Real-time | Socket.io client | Notifications, live collaboration |
| PDF | react-pdf | Client-side PDF preview for offer letters, reports |
| E-Signatures | Custom canvas + PDF injection | Capture signature → stamp onto document |
| File Upload | tus-js-client | Resumable uploads for large files |

### 3.2 Backend

| Layer | Technology | Rationale |
| --- | --- | --- |
| Runtime | Node.js 20+ LTS | Non-blocking I/O, large ecosystem |
| Framework | Express.js 5 | Mature, flexible, middleware-driven |
| ORM | Prisma | Type-safe queries, great migration tooling |
| Validation | Zod | Shared schemas between front/back |
| Auth | Passport.js + custom JWT | SAML/OIDC for enterprise SSO |
| Jobs | BullMQ | Reliable Redis-backed job queue |
| Real-time | Socket.io | WebSocket with fallback |
| Email | Nodemailer + MJML templates | Transactional emails |
| AI | OpenAI API / Anthropic API | HR intelligence features |
| Search | Elasticsearch (or Meilisearch) | Full-text search across employees, docs, policies |
| File Storage | AWS S3 (or MinIO) | Documents, images, attachments |
| PDF Generation | Puppeteer / pdf-lib | Offer letters, reports, pay stubs |
| E-Signatures | Custom (crypto-signed PDF) | Legally binding with audit trail |

### 3.3 Infrastructure

| Layer | Technology |
| --- | --- |
| Database | PostgreSQL 16 (Primary + Read Replicas) |
| Cache | Redis 7 (sessions, cache, pub/sub, queues) |
| Object Store | AWS S3 |
| CDN | CloudFront / Cloudflare |
| Hosting | AWS ECS Fargate or Railway (early stage) |
| CI/CD | GitHub Actions |
| Monitoring | Datadog or Grafana + Prometheus |
| Logging | Pino → structured JSON → ELK or Datadog |
| Error Tracking | Sentry |
| Secrets | AWS Secrets Manager or Doppler |

---

## 4. Multi-Tenancy Model

### 4.1 Tenant Isolation Strategy

```
Request → Auth Middleware → Extract tenant_id from JWT
                         → Set PostgreSQL session variable: SET app.current_tenant = 'uuid'
                         → RLS policies enforce: WHERE tenant_id = current_setting('app.current_tenant')
```

Every request is scoped to a tenant. Even if application code has a bug and forgets a WHERE clause, RLS prevents data leakage.

### 4.2 Tenant Hierarchy

```
Organization (Tenant)
├── Departments
│   └── Teams
├── Locations / Offices
├── Job Levels / Bands
├── Cost Centers
└── Legal Entities (for multi-entity orgs)
```

### 4.3 Subscription & Plan Gating

```
Tenant → has a Subscription → references a Plan (Core/Pro/Elite)
Plan → has many PlanFeatures (feature_key, limit, enabled)

Middleware: planGate('performance_management')
  1. Load tenant's plan from cache (Redis, TTL 5min)
  2. Check if feature_key is enabled
  3. Check usage limits (e.g., job_openings: 5/25/50)
  4. Allow or return 403 with upgrade prompt
```

---

## 5. Database Schema Design

### 5.1 Schema Organization

Schemas are logically grouped by domain. All tables live in a single PostgreSQL database with `tenant_id` as the partition key for RLS.

### 5.2 Core Tables

### Tenancy & Auth

```sql
-- Organization / Tenant
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,        -- subdomain: acme.hrforge.com
    logo_url        TEXT,
    industry        VARCHAR(100),
    company_size    VARCHAR(50),                          -- '1-10', '11-50', '51-200', etc.
    timezone        VARCHAR(50) DEFAULT 'UTC',
    date_format     VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    fiscal_year_start SMALLINT DEFAULT 1,                 -- month number
    status          VARCHAR(20) DEFAULT 'active',         -- active, suspended, churned
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription / Billing
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    plan_id         UUID NOT NULL REFERENCES plans(id),
    status          VARCHAR(20) DEFAULT 'active',         -- active, trialing, past_due, canceled
    billing_cycle   VARCHAR(20) DEFAULT 'monthly',        -- monthly, annual
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id    VARCHAR(255),
    employee_count  INT DEFAULT 0,                        -- for per-seat billing
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Plans & Feature Flags
CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(50) NOT NULL,                 -- Core, Pro, Elite
    slug            VARCHAR(50) UNIQUE NOT NULL,
    base_price_monthly  DECIMAL(10,2),
    per_seat_price      DECIMAL(10,2),
    display_order   INT
);

CREATE TABLE plan_features (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES plans(id),
    feature_key     VARCHAR(100) NOT NULL,                -- 'ats', 'performance_mgmt', etc.
    enabled         BOOLEAN DEFAULT true,
    limit_value     INT,                                  -- NULL = unlimited, e.g., 5 job openings
    UNIQUE(plan_id, feature_key)
);

-- Users & Authentication
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255),                         -- NULL if SSO-only
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    avatar_url      TEXT,
    role            VARCHAR(50) DEFAULT 'employee',       -- super_admin, admin, hr_manager, manager, employee
    status          VARCHAR(20) DEFAULT 'active',         -- active, invited, deactivated
    last_login_at   TIMESTAMPTZ,
    mfa_enabled     BOOLEAN DEFAULT false,
    mfa_secret      VARCHAR(255),
    sso_provider    VARCHAR(50),                          -- google, okta, azure_ad
    sso_id          VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- Role-Based Access Control
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN DEFAULT false,                -- system roles can't be deleted
    UNIQUE(tenant_id, name)
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource        VARCHAR(100) NOT NULL,                -- 'employees', 'reports', 'payroll'
    action          VARCHAR(50) NOT NULL,                 -- 'read', 'write', 'delete', 'approve'
    UNIQUE(resource, action)
);

CREATE TABLE role_permissions (
    role_id         UUID REFERENCES roles(id),
    permission_id   UUID REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id         UUID REFERENCES users(id),
    role_id         UUID REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

-- Audit Log (append-only)
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    action          VARCHAR(100) NOT NULL,                -- 'employee.created', 'timeoff.approved'
    resource_type   VARCHAR(100),
    resource_id     UUID,
    changes         JSONB,                                -- { field: { old: x, new: y } }
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Partition audit_logs by month for performance
```

### Employee Records (Core HR)

```sql
CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID REFERENCES users(id),            -- linked user account (nullable for records-only)
    employee_number VARCHAR(50),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    preferred_name  VARCHAR(100),
    email_personal  VARCHAR(255),
    email_work      VARCHAR(255),
    phone           VARCHAR(50),
    date_of_birth   DATE,
    gender          VARCHAR(50),
    nationality     VARCHAR(100),
    marital_status  VARCHAR(50),
    profile_photo_url TEXT,

    -- Employment Info
    hire_date       DATE NOT NULL,
    start_date      DATE,
    termination_date DATE,
    employment_status VARCHAR(30) DEFAULT 'active',       -- active, on_leave, terminated, retired
    employment_type VARCHAR(30),                          -- full_time, part_time, contract, intern
    probation_end_date DATE,

    -- Organizational
    department_id   UUID REFERENCES departments(id),
    team_id         UUID REFERENCES teams(id),
    location_id     UUID REFERENCES locations(id),
    manager_id      UUID REFERENCES employees(id),
    job_title       VARCHAR(255),
    job_level_id    UUID REFERENCES job_levels(id),
    cost_center_id  UUID REFERENCES cost_centers(id),
    legal_entity_id UUID REFERENCES legal_entities(id),

    -- Compensation (current snapshot — history in separate table)
    base_salary     DECIMAL(12,2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    pay_frequency   VARCHAR(20),                          -- monthly, biweekly, weekly

    -- Custom Fields (flexible schema)
    custom_fields   JSONB DEFAULT '{}',

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, employee_number)
);

CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    parent_id       UUID REFERENCES departments(id),      -- hierarchy support
    head_id         UUID REFERENCES employees(id),
    cost_center_id  UUID REFERENCES cost_centers(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    department_id   UUID REFERENCES departments(id),
    name            VARCHAR(255) NOT NULL,
    lead_id         UUID REFERENCES employees(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    address_line_1  VARCHAR(255),
    address_line_2  VARCHAR(255),
    city            VARCHAR(100),
    state           VARCHAR(100),
    country         VARCHAR(100),
    postal_code     VARCHAR(20),
    timezone        VARCHAR(50),
    is_headquarters BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_levels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(100) NOT NULL,                -- 'IC1', 'IC2', 'M1', 'Director'
    level_number    INT,
    track           VARCHAR(50),                          -- 'individual_contributor', 'management'
    min_salary      DECIMAL(12,2),
    mid_salary      DECIMAL(12,2),
    max_salary      DECIMAL(12,2),
    currency        VARCHAR(3) DEFAULT 'USD',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employee_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(100),                         -- 'contract', 'id', 'certificate', 'policy_ack'
    file_url        TEXT NOT NULL,
    file_size       BIGINT,
    mime_type       VARCHAR(100),
    uploaded_by     UUID REFERENCES users(id),
    is_sensitive    BOOLEAN DEFAULT false,
    expiry_date     DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employee_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    change_type     VARCHAR(50),                          -- 'promotion', 'transfer', 'salary_change', 'title_change'
    field_name      VARCHAR(100),
    old_value       TEXT,
    new_value       TEXT,
    effective_date  DATE NOT NULL,
    notes           TEXT,
    changed_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE emergency_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    name            VARCHAR(255) NOT NULL,
    relationship    VARCHAR(100),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    is_primary      BOOLEAN DEFAULT false
);
```

### Hiring & ATS

```sql
CREATE TABLE job_postings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    title           VARCHAR(255) NOT NULL,
    department_id   UUID REFERENCES departments(id),
    location_id     UUID REFERENCES locations(id),
    hiring_manager_id UUID REFERENCES employees(id),
    description     TEXT,
    requirements    TEXT,
    employment_type VARCHAR(30),
    salary_min      DECIMAL(12,2),
    salary_max      DECIMAL(12,2),
    salary_currency VARCHAR(3),
    show_salary     BOOLEAN DEFAULT false,
    status          VARCHAR(30) DEFAULT 'draft',          -- draft, open, paused, closed, filled
    published_at    TIMESTAMPTZ,
    closes_at       TIMESTAMPTZ,
    job_level_id    UUID REFERENCES job_levels(id),
    remote_policy   VARCHAR(30),                          -- onsite, hybrid, remote
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hiring_pipelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,                -- 'Engineering Pipeline', 'Default'
    is_default      BOOLEAN DEFAULT false
);

CREATE TABLE pipeline_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id     UUID NOT NULL REFERENCES hiring_pipelines(id),
    name            VARCHAR(100) NOT NULL,                -- 'Applied', 'Phone Screen', 'Interview', 'Offer'
    stage_order     INT NOT NULL,
    stage_type      VARCHAR(50),                          -- 'application', 'assessment', 'interview', 'offer', 'hired'
    auto_reject_days INT                                  -- auto-reject after N days in this stage
);

CREATE TABLE applicants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    job_posting_id  UUID NOT NULL REFERENCES job_postings(id),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    resume_url      TEXT,
    cover_letter    TEXT,
    linkedin_url    TEXT,
    source          VARCHAR(100),                         -- 'careers_page', 'linkedin', 'referral', 'indeed'
    referral_employee_id UUID REFERENCES employees(id),
    current_stage_id UUID REFERENCES pipeline_stages(id),
    status          VARCHAR(30) DEFAULT 'active',         -- active, withdrawn, rejected, hired
    rating          SMALLINT,                             -- 1-5 star rating
    rejection_reason VARCHAR(255),
    hired_date      DATE,
    applied_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE interview_scorecards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    applicant_id    UUID NOT NULL REFERENCES applicants(id),
    interviewer_id  UUID NOT NULL REFERENCES employees(id),
    stage_id        UUID REFERENCES pipeline_stages(id),
    overall_rating  SMALLINT,                             -- 1-5
    recommendation  VARCHAR(30),                          -- 'strong_yes', 'yes', 'no', 'strong_no'
    notes           TEXT,
    scores          JSONB,                                -- { "technical": 4, "communication": 5, ... }
    scheduled_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE offer_letters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    applicant_id    UUID NOT NULL REFERENCES applicants(id),
    template_id     UUID REFERENCES document_templates(id),
    content         TEXT,                                  -- rendered HTML/content
    salary          DECIMAL(12,2),
    start_date      DATE,
    status          VARCHAR(30) DEFAULT 'draft',          -- draft, sent, viewed, accepted, declined, expired
    sent_at         TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    signature_url   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Onboarding

```sql
CREATE TABLE onboarding_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    department_id   UUID REFERENCES departments(id),      -- department-specific template
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE onboarding_template_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES onboarding_templates(id),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    assignee_type   VARCHAR(30),                          -- 'new_hire', 'manager', 'hr', 'it', 'buddy'
    due_day_offset  INT,                                  -- days relative to start date
    category        VARCHAR(100),                         -- 'paperwork', 'equipment', 'training', 'introduction'
    is_required     BOOLEAN DEFAULT true,
    task_order      INT
);

CREATE TABLE onboarding_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    template_id     UUID REFERENCES onboarding_templates(id),
    status          VARCHAR(30) DEFAULT 'in_progress',    -- in_progress, completed, canceled
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE onboarding_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES onboarding_sessions(id),
    tenant_id       UUID NOT NULL,
    template_task_id UUID REFERENCES onboarding_template_tasks(id),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    assignee_id     UUID REFERENCES users(id),
    due_date        DATE,
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, in_progress, completed, skipped
    completed_at    TIMESTAMPTZ,
    completed_by    UUID REFERENCES users(id)
);

-- New Hire Packet (documents to be signed/acknowledged)
CREATE TABLE new_hire_packets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    document_id     UUID REFERENCES employee_documents(id),
    document_type   VARCHAR(100),                         -- 'tax_form', 'nda', 'handbook_ack', 'direct_deposit'
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, signed, acknowledged
    signed_at       TIMESTAMPTZ,
    signature_url   TEXT
);
```

### Time Off & Benefits

```sql
CREATE TABLE time_off_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,                -- 'Annual Leave', 'Sick Leave', 'Parental'
    type            VARCHAR(50),                          -- 'vacation', 'sick', 'personal', 'parental', 'bereavement'
    accrual_type    VARCHAR(30),                          -- 'fixed', 'accrual', 'unlimited'
    days_per_year   DECIMAL(5,1),
    accrual_frequency VARCHAR(20),                        -- 'monthly', 'biweekly', 'yearly'
    max_carryover   DECIMAL(5,1),
    max_balance     DECIMAL(5,1),
    waiting_period_days INT DEFAULT 0,
    requires_approval BOOLEAN DEFAULT true,
    min_increment   DECIMAL(3,1) DEFAULT 0.5,             -- half-day minimum
    is_paid         BOOLEAN DEFAULT true,
    applies_to      JSONB,                                -- filter: departments, locations, employment_types
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE time_off_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    policy_id       UUID NOT NULL REFERENCES time_off_policies(id),
    year            INT NOT NULL,
    entitled_days   DECIMAL(5,1),
    used_days       DECIMAL(5,1) DEFAULT 0,
    pending_days    DECIMAL(5,1) DEFAULT 0,
    carried_over    DECIMAL(5,1) DEFAULT 0,
    adjustment_days DECIMAL(5,1) DEFAULT 0,
    UNIQUE(tenant_id, employee_id, policy_id, year)
);

CREATE TABLE time_off_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    policy_id       UUID NOT NULL REFERENCES time_off_policies(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    start_half      VARCHAR(10),                          -- 'first_half', 'second_half', NULL for full day
    end_half        VARCHAR(10),
    total_days      DECIMAL(5,1) NOT NULL,
    reason          TEXT,
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, approved, rejected, canceled
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Company Holidays
CREATE TABLE holidays (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    date            DATE NOT NULL,
    is_recurring    BOOLEAN DEFAULT false,
    applies_to      JSONB,                                -- locations, departments filter
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Benefits
CREATE TABLE benefit_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(50),                          -- 'health', 'dental', 'vision', '401k', 'life', 'hsa'
    provider        VARCHAR(255),
    description     TEXT,
    plan_document_url TEXT,
    employer_contribution DECIMAL(12,2),
    employee_cost   DECIMAL(12,2),
    coverage_type   VARCHAR(50),                          -- 'individual', 'individual_spouse', 'family'
    enrollment_start DATE,
    enrollment_end  DATE,
    effective_date  DATE,
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE benefit_enrollments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    benefit_plan_id UUID NOT NULL REFERENCES benefit_plans(id),
    coverage_level  VARCHAR(50),
    enrolled_at     TIMESTAMPTZ DEFAULT NOW(),
    effective_date  DATE,
    end_date        DATE,
    status          VARCHAR(30) DEFAULT 'active',         -- active, waived, terminated
    dependents      JSONB                                 -- [{ name, relationship, dob }]
);
```

### Employee Experience (Satisfaction & Wellbeing)

```sql
CREATE TABLE surveys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    title           VARCHAR(255) NOT NULL,
    type            VARCHAR(50),                          -- 'satisfaction', 'wellbeing', 'pulse', 'engagement', 'custom'
    description     TEXT,
    is_anonymous    BOOLEAN DEFAULT true,
    frequency       VARCHAR(30),                          -- 'one_time', 'weekly', 'monthly', 'quarterly'
    status          VARCHAR(30) DEFAULT 'draft',          -- draft, active, closed
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    target_audience JSONB,                                -- departments, teams, locations filter
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE survey_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES surveys(id),
    question_text   TEXT NOT NULL,
    question_type   VARCHAR(30),                          -- 'rating', 'nps', 'multiple_choice', 'text', 'scale'
    options         JSONB,                                -- for multiple choice
    is_required     BOOLEAN DEFAULT true,
    question_order  INT,
    category        VARCHAR(100)                          -- 'work_life_balance', 'management', 'growth'
);

CREATE TABLE survey_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    survey_id       UUID NOT NULL REFERENCES surveys(id),
    employee_id     UUID REFERENCES employees(id),        -- NULL if anonymous
    anonymous_token VARCHAR(255),                         -- for anonymous tracking (prevent duplicates)
    submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE survey_answers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id     UUID NOT NULL REFERENCES survey_responses(id),
    question_id     UUID NOT NULL REFERENCES survey_questions(id),
    rating_value    SMALLINT,
    text_value      TEXT,
    selected_options JSONB
);
```

### Performance Management (Pro + Elite)

```sql
CREATE TABLE review_cycles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,                -- 'Q1 2026 Review', 'Annual 2026'
    type            VARCHAR(50),                          -- 'annual', 'quarterly', 'probation', 'project'
    status          VARCHAR(30) DEFAULT 'draft',          -- draft, active, in_review, calibration, completed
    review_period_start DATE,
    review_period_end   DATE,
    submission_deadline TIMESTAMPTZ,
    includes_self_review    BOOLEAN DEFAULT true,
    includes_manager_review BOOLEAN DEFAULT true,
    includes_peer_review    BOOLEAN DEFAULT false,
    includes_upward_review  BOOLEAN DEFAULT false,
    target_audience JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    sections        JSONB                                 -- [{ title, questions: [{ text, type, weight }] }]
);

CREATE TABLE performance_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    cycle_id        UUID NOT NULL REFERENCES review_cycles(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    reviewer_id     UUID NOT NULL REFERENCES employees(id),
    review_type     VARCHAR(30),                          -- 'self', 'manager', 'peer', 'upward'
    template_id     UUID REFERENCES review_templates(id),
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, in_progress, submitted, acknowledged
    overall_rating  DECIMAL(3,1),
    strengths       TEXT,
    areas_for_improvement TEXT,
    responses       JSONB,                                -- { section_id: { question_id: { rating, comment } } }
    submitted_at    TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 360° Feedback
CREATE TABLE feedback_360_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    cycle_id        UUID REFERENCES review_cycles(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),  -- person being reviewed
    reviewer_id     UUID NOT NULL REFERENCES employees(id),  -- person giving feedback
    relationship    VARCHAR(30),                              -- 'peer', 'direct_report', 'cross_functional'
    status          VARCHAR(30) DEFAULT 'pending',
    feedback        JSONB,
    submitted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Goals & OKRs
CREATE TABLE goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    goal_type       VARCHAR(30),                          -- 'individual', 'team', 'department', 'company'
    parent_goal_id  UUID REFERENCES goals(id),            -- cascading goals / OKR alignment
    status          VARCHAR(30) DEFAULT 'not_started',    -- not_started, in_progress, completed, canceled
    priority        VARCHAR(20),                          -- 'low', 'medium', 'high', 'critical'
    progress        DECIMAL(5,2) DEFAULT 0,               -- 0-100
    start_date      DATE,
    due_date        DATE,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goal_key_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id         UUID NOT NULL REFERENCES goals(id),
    title           VARCHAR(255) NOT NULL,
    metric_type     VARCHAR(30),                          -- 'number', 'percentage', 'currency', 'boolean'
    target_value    DECIMAL(12,2),
    current_value   DECIMAL(12,2) DEFAULT 0,
    unit            VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 1:1 Meetings
CREATE TABLE one_on_ones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    manager_id      UUID NOT NULL REFERENCES employees(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    scheduled_at    TIMESTAMPTZ,
    duration_minutes INT DEFAULT 30,
    status          VARCHAR(30) DEFAULT 'scheduled',      -- scheduled, completed, canceled, rescheduled
    recurrence      VARCHAR(30),                          -- 'weekly', 'biweekly', 'monthly'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE one_on_one_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    one_on_one_id   UUID NOT NULL REFERENCES one_on_ones(id),
    tenant_id       UUID NOT NULL,
    author_id       UUID NOT NULL REFERENCES users(id),
    content         TEXT,
    is_private      BOOLEAN DEFAULT false,                -- private notes only visible to author
    action_items    JSONB,                                -- [{ text, assignee_id, due_date, completed }]
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Compensation Management (Pro + Elite)

```sql
CREATE TABLE compensation_bands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    job_level_id    UUID REFERENCES job_levels(id),
    job_family      VARCHAR(100),                         -- 'Engineering', 'Sales', 'Marketing'
    location_id     UUID REFERENCES locations(id),
    currency        VARCHAR(3) DEFAULT 'USD',
    min_salary      DECIMAL(12,2),
    mid_salary      DECIMAL(12,2),
    max_salary      DECIMAL(12,2),
    effective_date  DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE compensation_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,                -- 'Annual Comp Review 2026'
    cycle_type      VARCHAR(30),                          -- 'annual', 'promotion', 'market_adjustment'
    budget_pool     DECIMAL(14,2),
    status          VARCHAR(30) DEFAULT 'planning',       -- planning, in_progress, approval, completed
    effective_date  DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE compensation_changes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    review_id       UUID REFERENCES compensation_reviews(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    change_type     VARCHAR(30),                          -- 'merit', 'promotion', 'market', 'equity'
    current_salary  DECIMAL(12,2),
    proposed_salary DECIMAL(12,2),
    approved_salary DECIMAL(12,2),
    percentage_change DECIMAL(5,2),
    justification   TEXT,
    status          VARCHAR(30) DEFAULT 'proposed',       -- proposed, manager_approved, hr_approved, final
    proposed_by     UUID REFERENCES users(id),
    approved_by     UUID REFERENCES users(id),
    effective_date  DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE total_rewards_statements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    year            INT NOT NULL,
    base_salary     DECIMAL(12,2),
    bonus           DECIMAL(12,2),
    equity_value    DECIMAL(12,2),
    benefits_value  DECIMAL(12,2),
    retirement_contribution DECIMAL(12,2),
    other_compensation JSONB,
    total_value     DECIMAL(14,2),
    pdf_url         TEXT,
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Employee Community (Pro + Elite)

```sql
CREATE TABLE community_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    author_id       UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(30),                          -- 'announcement', 'discussion', 'poll', 'shoutout'
    title           VARCHAR(255),
    content         TEXT,
    rich_content    JSONB,                                -- Tiptap JSON for rich media
    is_pinned       BOOLEAN DEFAULT false,
    visibility      VARCHAR(30) DEFAULT 'all',            -- 'all', 'department', 'team', 'group'
    target_group_id UUID,                                 -- references interest_groups if scoped
    attachment_urls JSONB,
    likes_count     INT DEFAULT 0,
    comments_count  INT DEFAULT 0,
    published_at    TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE community_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    post_id         UUID NOT NULL REFERENCES community_posts(id),
    author_id       UUID NOT NULL REFERENCES users(id),
    parent_id       UUID REFERENCES community_comments(id), -- threaded replies
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE interest_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    cover_image_url TEXT,
    is_private      BOOLEAN DEFAULT false,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE interest_group_members (
    group_id        UUID REFERENCES interest_groups(id),
    user_id         UUID REFERENCES users(id),
    role            VARCHAR(20) DEFAULT 'member',         -- 'admin', 'moderator', 'member'
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
```

### Compliance & Training

```sql
CREATE TABLE compliance_requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    jurisdiction    VARCHAR(100),                         -- 'US-Federal', 'US-CA', 'EU-GDPR'
    category        VARCHAR(100),                         -- 'labor_law', 'safety', 'harassment', 'data_privacy'
    due_date        DATE,
    recurrence      VARCHAR(30),                          -- 'annual', 'biennial', 'one_time'
    status          VARCHAR(30) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE training_courses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(100),                         -- 'compliance', 'onboarding', 'skill_development', 'leadership'
    content_type    VARCHAR(30),                          -- 'video', 'scorm', 'document', 'quiz', 'external_link'
    content_url     TEXT,
    duration_minutes INT,
    is_mandatory    BOOLEAN DEFAULT false,
    compliance_requirement_id UUID REFERENCES compliance_requirements(id),
    passing_score   DECIMAL(5,2),
    certificate_template TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE training_enrollments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    employee_id     UUID NOT NULL REFERENCES employees(id),
    course_id       UUID NOT NULL REFERENCES training_courses(id),
    status          VARCHAR(30) DEFAULT 'assigned',       -- assigned, in_progress, completed, overdue
    progress        DECIMAL(5,2) DEFAULT 0,
    score           DECIMAL(5,2),
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    due_date        DATE,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    certificate_url TEXT
);
```

### Workflows & Approvals

```sql
CREATE TABLE workflow_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    trigger_type    VARCHAR(50),                          -- 'time_off', 'expense', 'promotion', 'termination', 'custom'
    description     TEXT,
    is_active       BOOLEAN DEFAULT true,
    steps           JSONB,                                -- [{ order, approver_type, approver_id, condition, auto_approve_days }]
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow_instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    template_id     UUID REFERENCES workflow_templates(id),
    resource_type   VARCHAR(100),                         -- 'time_off_request', 'compensation_change', etc.
    resource_id     UUID,
    initiated_by    UUID REFERENCES users(id),
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, in_progress, approved, rejected, canceled
    current_step    INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE workflow_approvals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES workflow_instances(id),
    tenant_id       UUID NOT NULL,
    step_order      INT NOT NULL,
    approver_id     UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, approved, rejected, skipped
    decision_at     TIMESTAMPTZ,
    comments        TEXT
);
```

### E-Signatures

```sql
CREATE TABLE signature_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    document_id     UUID REFERENCES employee_documents(id),
    document_url    TEXT NOT NULL,
    title           VARCHAR(255) NOT NULL,
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, partially_signed, completed, voided, expired
    created_by      UUID REFERENCES users(id),
    expires_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE signature_signers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES signature_requests(id),
    signer_id       UUID REFERENCES users(id),
    signer_email    VARCHAR(255),
    signer_name     VARCHAR(255),
    sign_order      INT DEFAULT 1,
    status          VARCHAR(30) DEFAULT 'pending',        -- pending, viewed, signed, declined
    signature_data  TEXT,                                  -- base64 signature image or crypto hash
    signed_at       TIMESTAMPTZ,
    ip_address      INET,
    user_agent      TEXT
);
```

### Notifications & Communication

```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(100),                         -- 'time_off_approved', 'review_assigned', 'goal_due'
    title           VARCHAR(255),
    message         TEXT,
    resource_type   VARCHAR(100),
    resource_id     UUID,
    is_read         BOOLEAN DEFAULT false,
    read_at         TIMESTAMPTZ,
    channel         VARCHAR(30) DEFAULT 'in_app',         -- 'in_app', 'email', 'both'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(50),                          -- 'offer_letter', 'policy', 'handbook', 'form'
    content         TEXT,                                  -- HTML/Tiptap JSON with merge fields: {{employee.first_name}}
    merge_fields    JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Analytics & Reports

```sql
CREATE TABLE saved_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(50),                          -- 'standard', 'custom'
    category        VARCHAR(100),                         -- 'headcount', 'turnover', 'compensation', 'time_off'
    config          JSONB,                                -- { filters, columns, groupBy, sortBy, chartType }
    created_by      UUID REFERENCES users(id),
    is_shared       BOOLEAN DEFAULT false,
    schedule        JSONB,                                -- { frequency, recipients, format }
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE custom_dashboards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            VARCHAR(255) NOT NULL,
    layout          JSONB,                                -- widget positions and sizes
    widgets         JSONB,                                -- [{ type, report_id, config }]
    is_default      BOOLEAN DEFAULT false,
    shared_with     JSONB,                                -- roles/users
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. API Architecture

### 6.1 API Conventions

```
Base URL:       https://api.hrforge.com/v1
Auth:           Bearer JWT in Authorization header
Content-Type:   application/json
Pagination:     ?page=1&per_page=25&sort=created_at&order=desc
Filtering:      ?department_id=uuid&status=active&hire_date_gte=2025-01-01
Search:         ?q=search+term
Includes:       ?include=department,manager (eager load relations)
Responses:      { data: T, meta: { page, per_page, total, total_pages } }
Errors:         { error: { code, message, details } }
```

### 6.2 Full API Route Map

### Auth & Identity

```
POST   /v1/auth/register                     # Tenant + admin user creation
POST   /v1/auth/login                        # Email/password login
POST   /v1/auth/login/sso                    # SSO initiation (SAML/OIDC)
POST   /v1/auth/login/sso/callback           # SSO callback
POST   /v1/auth/refresh                      # Refresh access token
POST   /v1/auth/logout                       # Invalidate session
POST   /v1/auth/forgot-password              # Send reset email
POST   /v1/auth/reset-password               # Reset with token
POST   /v1/auth/mfa/enable                   # Enable MFA
POST   /v1/auth/mfa/verify                   # Verify MFA code
DELETE /v1/auth/mfa                           # Disable MFA
GET    /v1/auth/me                            # Current user profile
PATCH  /v1/auth/me                            # Update profile
PATCH  /v1/auth/me/password                   # Change password
```

### Tenant Administration

```
GET    /v1/tenant                             # Get current tenant info
PATCH  /v1/tenant                             # Update tenant settings
GET    /v1/tenant/subscription                # Current subscription details
POST   /v1/tenant/subscription/upgrade        # Upgrade plan
POST   /v1/tenant/subscription/cancel         # Cancel subscription
GET    /v1/tenant/invoices                    # Billing history
GET    /v1/tenant/usage                       # Feature usage stats (seat count, job openings, etc.)

# Roles & Permissions
GET    /v1/roles                              # List roles
POST   /v1/roles                              # Create custom role
GET    /v1/roles/:id                          # Get role details
PATCH  /v1/roles/:id                          # Update role
DELETE /v1/roles/:id                          # Delete role (if not system)
GET    /v1/permissions                        # List all permissions
```

### Users & Access

```
GET    /v1/users                              # List all users
POST   /v1/users                              # Invite user
GET    /v1/users/:id                          # Get user
PATCH  /v1/users/:id                          # Update user
DELETE /v1/users/:id                          # Deactivate user
POST   /v1/users/:id/roles                    # Assign role
DELETE /v1/users/:id/roles/:roleId            # Remove role
POST   /v1/users/bulk-invite                  # Invite multiple users
```

### Employees (Core HR)

```
GET    /v1/employees                          # List with filters, search, pagination
POST   /v1/employees                          # Create employee record
GET    /v1/employees/:id                      # Full employee profile
PATCH  /v1/employees/:id                      # Update employee
DELETE /v1/employees/:id                      # Soft delete / archive
GET    /v1/employees/:id/history              # Employment history timeline
GET    /v1/employees/:id/documents            # Employee documents
POST   /v1/employees/:id/documents            # Upload document
DELETE /v1/employees/:id/documents/:docId     # Remove document
GET    /v1/employees/:id/emergency-contacts   # Emergency contacts
POST   /v1/employees/:id/emergency-contacts   # Add emergency contact
PATCH  /v1/employees/:id/emergency-contacts/:cid
DELETE /v1/employees/:id/emergency-contacts/:cid
POST   /v1/employees/:id/terminate            # Terminate employee
POST   /v1/employees/:id/rehire              # Rehire terminated employee
GET    /v1/employees/:id/direct-reports       # Manager's direct reports
GET    /v1/employees/:id/org-chart            # Org chart from this node
POST   /v1/employees/import                   # Bulk CSV import
GET    /v1/employees/export                   # Export to CSV/Excel

# Self-service (current employee)
GET    /v1/me/profile                         # Own employee record
PATCH  /v1/me/profile                         # Update own info (gated fields)
GET    /v1/me/documents                       # Own documents
GET    /v1/me/payslips                        # Own payslips
```

### Organization Structure

```
# Departments
GET    /v1/departments                        # List departments (tree)
POST   /v1/departments                        # Create department
GET    /v1/departments/:id                    # Get department
PATCH  /v1/departments/:id                    # Update department
DELETE /v1/departments/:id                    # Delete department
GET    /v1/departments/:id/employees          # Employees in department

# Teams
GET    /v1/teams                              # List teams
POST   /v1/teams                              # Create team
GET    /v1/teams/:id                          # Get team
PATCH  /v1/teams/:id                          # Update team
DELETE /v1/teams/:id                          # Delete team

# Locations
GET    /v1/locations                          # List locations
POST   /v1/locations                          # Create location
GET    /v1/locations/:id                      # Get location
PATCH  /v1/locations/:id                      # Update location
DELETE /v1/locations/:id                      # Delete location

# Job Levels & Bands
GET    /v1/job-levels                         # List levels
POST   /v1/job-levels                         # Create level
PATCH  /v1/job-levels/:id                     # Update level
DELETE /v1/job-levels/:id                     # Delete level
```

### Hiring & ATS (Core: 5 jobs, Pro: 25, Elite: 50)

```
# Job Postings
GET    /v1/jobs                               # List job postings
POST   /v1/jobs                               # Create job posting
GET    /v1/jobs/:id                           # Get job details
PATCH  /v1/jobs/:id                           # Update job
DELETE /v1/jobs/:id                           # Delete/archive job
POST   /v1/jobs/:id/publish                   # Publish job
POST   /v1/jobs/:id/close                     # Close job
GET    /v1/jobs/:id/applicants                # Applicants for this job

# Hiring Pipelines
GET    /v1/hiring-pipelines                   # List pipelines
POST   /v1/hiring-pipelines                   # Create pipeline
PATCH  /v1/hiring-pipelines/:id               # Update pipeline
GET    /v1/hiring-pipelines/:id/stages        # Get stages

# Applicants
GET    /v1/applicants                         # List all applicants (across jobs)
POST   /v1/applicants                         # Create applicant (manual entry)
GET    /v1/applicants/:id                     # Get applicant details
PATCH  /v1/applicants/:id                     # Update applicant
POST   /v1/applicants/:id/move-stage          # Move to pipeline stage
POST   /v1/applicants/:id/reject              # Reject applicant
POST   /v1/applicants/:id/hire                # Convert to employee
GET    /v1/applicants/:id/scorecards          # Interview scorecards
POST   /v1/applicants/:id/scorecards          # Submit scorecard

# Offer Letters
POST   /v1/applicants/:id/offer              # Generate offer letter
GET    /v1/offers/:id                         # Get offer
POST   /v1/offers/:id/send                   # Send offer to candidate
POST   /v1/offers/:id/revoke                 # Revoke offer

# Public Careers Page (no auth)
GET    /v1/public/careers/:tenantSlug         # Public job listings
GET    /v1/public/careers/:tenantSlug/:jobId  # Public job details
POST   /v1/public/careers/:tenantSlug/:jobId/apply  # Submit application
```

### Onboarding

```
GET    /v1/onboarding/templates               # List onboarding templates
POST   /v1/onboarding/templates               # Create template
GET    /v1/onboarding/templates/:id           # Get template with tasks
PATCH  /v1/onboarding/templates/:id           # Update template
DELETE /v1/onboarding/templates/:id           # Delete template

GET    /v1/onboarding/sessions                # List active onboarding sessions
POST   /v1/onboarding/sessions                # Start onboarding for employee
GET    /v1/onboarding/sessions/:id            # Get session details
PATCH  /v1/onboarding/sessions/:id/tasks/:taskId  # Update task status
GET    /v1/onboarding/sessions/:id/progress   # Progress summary

# New Hire Packets
GET    /v1/employees/:id/new-hire-packet      # Get packet items
POST   /v1/employees/:id/new-hire-packet/:itemId/sign  # Sign/acknowledge document
```

### Time Off & Leave

```
# Policies (admin)
GET    /v1/time-off/policies                  # List policies
POST   /v1/time-off/policies                  # Create policy
PATCH  /v1/time-off/policies/:id              # Update policy
DELETE /v1/time-off/policies/:id              # Delete policy

# Requests
GET    /v1/time-off/requests                  # List requests (filtered by role)
POST   /v1/time-off/requests                  # Submit time off request
GET    /v1/time-off/requests/:id              # Get request details
PATCH  /v1/time-off/requests/:id              # Update request
DELETE /v1/time-off/requests/:id              # Cancel request
POST   /v1/time-off/requests/:id/approve      # Approve request
POST   /v1/time-off/requests/:id/reject       # Reject request

# Balances
GET    /v1/time-off/balances                  # All employees' balances (admin)
GET    /v1/time-off/balances/:employeeId      # Specific employee balances
PATCH  /v1/time-off/balances/:id/adjust       # Manual balance adjustment

# Calendar
GET    /v1/time-off/calendar                  # Team/company calendar view
GET    /v1/holidays                           # Company holidays
POST   /v1/holidays                           # Add holiday
PATCH  /v1/holidays/:id                       # Update holiday
DELETE /v1/holidays/:id                       # Remove holiday

# Self-service
GET    /v1/me/time-off/balances               # My balances
GET    /v1/me/time-off/requests               # My requests
POST   /v1/me/time-off/requests               # Submit my request
```

### Benefits

```
GET    /v1/benefits/plans                     # List benefit plans
POST   /v1/benefits/plans                     # Create plan
PATCH  /v1/benefits/plans/:id                 # Update plan
DELETE /v1/benefits/plans/:id                 # Deactivate plan
GET    /v1/benefits/enrollments               # List all enrollments
POST   /v1/benefits/enrollments               # Enroll employee
PATCH  /v1/benefits/enrollments/:id           # Update enrollment
DELETE /v1/benefits/enrollments/:id           # Cancel enrollment
GET    /v1/me/benefits                        # My benefit enrollments
POST   /v1/me/benefits/enroll                 # Self-enroll during open enrollment
GET    /v1/me/benefits/election-overview      # My benefits overview
```

### Performance Management (Pro + Elite)

```
# Review Cycles
GET    /v1/performance/cycles                 # List review cycles
POST   /v1/performance/cycles                 # Create cycle
GET    /v1/performance/cycles/:id             # Get cycle details
PATCH  /v1/performance/cycles/:id             # Update cycle
POST   /v1/performance/cycles/:id/launch      # Launch cycle (send reviews)
POST   /v1/performance/cycles/:id/close       # Close cycle

# Reviews
GET    /v1/performance/reviews                # List all reviews
GET    /v1/performance/reviews/:id            # Get review
PATCH  /v1/performance/reviews/:id            # Update review (save progress)
POST   /v1/performance/reviews/:id/submit     # Submit review
POST   /v1/performance/reviews/:id/acknowledge # Employee acknowledges review
GET    /v1/me/performance/reviews             # My reviews (to complete + received)

# 360° Feedback
GET    /v1/performance/360/:employeeId        # Get 360 requests for employee
POST   /v1/performance/360                    # Create 360 feedback request
POST   /v1/performance/360/:id/submit         # Submit 360 feedback

# Review Templates
GET    /v1/performance/templates              # List templates
POST   /v1/performance/templates              # Create template
PATCH  /v1/performance/templates/:id          # Update template

# Goals
GET    /v1/goals                              # List goals (filtered)
POST   /v1/goals                              # Create goal
GET    /v1/goals/:id                          # Get goal details
PATCH  /v1/goals/:id                          # Update goal
DELETE /v1/goals/:id                          # Delete goal
PATCH  /v1/goals/:id/progress                 # Update progress
GET    /v1/goals/:id/key-results              # List key results
POST   /v1/goals/:id/key-results              # Add key result
PATCH  /v1/goals/:id/key-results/:krId        # Update key result
GET    /v1/me/goals                           # My goals

# 1:1 Meetings
GET    /v1/one-on-ones                        # List 1:1s
POST   /v1/one-on-ones                        # Schedule 1:1
GET    /v1/one-on-ones/:id                    # Get 1:1 details + notes
POST   /v1/one-on-ones/:id/notes              # Add note
PATCH  /v1/one-on-ones/:id/notes/:noteId      # Update note
GET    /v1/me/one-on-ones                     # My 1:1s
```

### Compensation (Pro + Elite)

```
GET    /v1/compensation/bands                 # List compensation bands
POST   /v1/compensation/bands                 # Create band
PATCH  /v1/compensation/bands/:id             # Update band
GET    /v1/compensation/benchmarks            # Market benchmarks (Elite)
GET    /v1/compensation/reviews               # List comp review cycles
POST   /v1/compensation/reviews               # Create comp review
GET    /v1/compensation/reviews/:id           # Get comp review details
POST   /v1/compensation/reviews/:id/changes   # Propose salary change
PATCH  /v1/compensation/changes/:id           # Update change proposal
POST   /v1/compensation/changes/:id/approve   # Approve change
GET    /v1/compensation/pay-visualization     # Pay equity visualization (Elite)
GET    /v1/compensation/total-rewards/:employeeId  # Total rewards statement
POST   /v1/compensation/total-rewards/generate     # Batch generate statements
```

### Employee Community (Pro + Elite)

```
GET    /v1/community/posts                    # List posts (feed)
POST   /v1/community/posts                    # Create post
GET    /v1/community/posts/:id                # Get post with comments
PATCH  /v1/community/posts/:id                # Update post
DELETE /v1/community/posts/:id                # Delete post
POST   /v1/community/posts/:id/like           # Like post
DELETE /v1/community/posts/:id/like           # Unlike post
POST   /v1/community/posts/:id/comments       # Add comment
DELETE /v1/community/comments/:id             # Delete comment

GET    /v1/community/groups                   # List interest groups
POST   /v1/community/groups                   # Create group
GET    /v1/community/groups/:id               # Get group
POST   /v1/community/groups/:id/join          # Join group
POST   /v1/community/groups/:id/leave         # Leave group
GET    /v1/community/groups/:id/posts         # Posts in group
```

### Compliance & Training

```
GET    /v1/compliance/requirements            # List compliance requirements
POST   /v1/compliance/requirements            # Create requirement
PATCH  /v1/compliance/requirements/:id        # Update requirement
GET    /v1/compliance/status                  # Org-wide compliance dashboard

GET    /v1/training/courses                   # List courses
POST   /v1/training/courses                   # Create course
GET    /v1/training/courses/:id               # Get course details
PATCH  /v1/training/courses/:id               # Update course
DELETE /v1/training/courses/:id               # Delete course
POST   /v1/training/courses/:id/assign        # Assign to employees
GET    /v1/training/enrollments               # List all enrollments
PATCH  /v1/training/enrollments/:id           # Update progress/completion
GET    /v1/me/training                        # My assigned courses
PATCH  /v1/me/training/:id/progress           # Update my progress
POST   /v1/me/training/:id/complete           # Mark complete / submit quiz
```

### Surveys

```
GET    /v1/surveys                            # List surveys
POST   /v1/surveys                            # Create survey
GET    /v1/surveys/:id                        # Get survey
PATCH  /v1/surveys/:id                        # Update survey
POST   /v1/surveys/:id/launch                 # Launch survey
POST   /v1/surveys/:id/close                  # Close survey
GET    /v1/surveys/:id/results                # Aggregated results
GET    /v1/surveys/:id/results/export         # Export results
POST   /v1/surveys/:id/respond                # Submit response (anonymous-safe)
GET    /v1/me/surveys                         # Surveys assigned to me
```

### E-Signatures

```
POST   /v1/signatures/requests                # Create signature request
GET    /v1/signatures/requests/:id            # Get request status
POST   /v1/signatures/requests/:id/void       # Void request
POST   /v1/signatures/:signerId/sign          # Submit signature
GET    /v1/me/signatures/pending              # My pending signatures
```

### Workflows

```
GET    /v1/workflows/templates                # List workflow templates
POST   /v1/workflows/templates                # Create workflow
PATCH  /v1/workflows/templates/:id            # Update workflow
GET    /v1/workflows/instances                # List workflow instances
GET    /v1/workflows/instances/:id            # Get instance status
POST   /v1/workflows/instances/:id/approve    # Approve current step
POST   /v1/workflows/instances/:id/reject     # Reject current step
GET    /v1/me/workflows/pending               # My pending approvals
```

### Reports & Analytics

```
GET    /v1/reports                            # List saved reports
POST   /v1/reports                            # Create/save report
GET    /v1/reports/:id                        # Get report config
POST   /v1/reports/:id/run                    # Execute report
GET    /v1/reports/:id/export                 # Export (CSV/PDF/Excel)
PATCH  /v1/reports/:id                        # Update report
DELETE /v1/reports/:id                        # Delete report

# Standard reports
GET    /v1/reports/standard/headcount         # Headcount report
GET    /v1/reports/standard/turnover          # Turnover report
GET    /v1/reports/standard/demographics      # Demographics report
GET    /v1/reports/standard/compensation      # Compensation report
GET    /v1/reports/standard/time-off          # Time off usage report
GET    /v1/reports/standard/hiring-funnel     # Hiring funnel report

# Dashboards (Elite)
GET    /v1/dashboards                         # List custom dashboards
POST   /v1/dashboards                         # Create dashboard
GET    /v1/dashboards/:id                     # Get dashboard
PATCH  /v1/dashboards/:id                     # Update dashboard
DELETE /v1/dashboards/:id                     # Delete dashboard

# Benchmarks (Elite)
GET    /v1/benchmarks/turnover                # Turnover benchmarks
GET    /v1/benchmarks/satisfaction            # Satisfaction benchmarks
GET    /v1/benchmarks/demographics            # Age & Gender benchmarks
```

### HR Intelligence (AI)

```
POST   /v1/ai/ask                             # Ask AI assistant (context-aware per plan)
POST   /v1/ai/insights/generate              # Generate data insights
GET    /v1/ai/insights                        # List generated insights
POST   /v1/ai/summarize                       # Summarize document/policy
POST   /v1/ai/draft                           # Draft job description, offer letter, etc.
GET    /v1/ai/recommendations                 # Proactive recommendations
```

### Notifications

```
GET    /v1/notifications                      # List notifications (paginated)
PATCH  /v1/notifications/:id/read             # Mark as read
POST   /v1/notifications/mark-all-read        # Mark all as read
GET    /v1/notifications/preferences          # Notification preferences
PATCH  /v1/notifications/preferences          # Update preferences
```

### Webhooks & Integrations

```
GET    /v1/webhooks                           # List webhooks
POST   /v1/webhooks                           # Register webhook
PATCH  /v1/webhooks/:id                       # Update webhook
DELETE /v1/webhooks/:id                       # Delete webhook
GET    /v1/webhooks/:id/logs                  # Delivery logs

GET    /v1/integrations                       # List available integrations
POST   /v1/integrations/:provider/connect     # Connect integration (Slack, Google, etc.)
DELETE /v1/integrations/:provider/disconnect   # Disconnect integration
```

---

## 7. Feature Tier Matrix (Plan Gating)

| Feature Key | Core | Pro | Elite |
| --- | --- | --- | --- |
| `ai_assistant` | HR Data Questions | + Policies & Docs | + Benchmarks & Analysis |
| `ai_insights` | ✓ | ✓ | ✓ |
| `employee_records` | ✓ | ✓ | ✓ |
| `standard_reports` | ✓ | ✓ | ✓ |
| `custom_reports` | ✓ | ✓ | ✓ |
| `workflows` | ✓ | ✓ | ✓ |
| `ats_job_limit` | 5 | 25 | 50 |
| `email_offer_templates` | ✓ | ✓ | ✓ |
| `new_hire_packet` | ✓ | ✓ | ✓ |
| `onboarding_checklist` | ✓ | ✓ | ✓ |
| `e_signatures` | ✓ | ✓ | ✓ |
| `time_off` | ✓ | ✓ | ✓ |
| `benefits_tracking` | ✓ | ✓ | ✓ |
| `employee_satisfaction` | ✓ | ✓ | ✓ |
| `employee_wellbeing` | ✓ | ✓ | ✓ |
| `compliance_intelligence` | ✓ | ✓ | ✓ |
| `compliance_training_limit` | 1 | 15 | 300+ |
| `performance_management` | ✗ | ✓ | ✓ |
| `360_feedback` | ✗ | ✓ | ✓ |
| `one_on_ones` | ✗ | ✓ | ✓ |
| `goal_tracking` | ✗ | ✓ | ✓ |
| `employee_community` | ✗ | ✓ | ✓ |
| `compensation_benchmarking` | ✗ | ✗ | ✓ |
| `compensation_planning` | ✗ | ✓ | ✓ |
| `levels_and_bands` | ✓ | ✓ | ✓ |
| `pay_visualization` | ✗ | ✗ | ✓ |
| `total_rewards` | ✓ | ✓ | ✓ |
| `custom_dashboards` | ✗ | ✗ | ✓ |
| `advanced_visualizations` | ✗ | ✗ | ✓ |
| `secure_sharing` | ✗ | ✗ | ✓ |
| `hr_benchmarks` | ✗ | ✗ | ✓ |
| `premium_services` | ✗ | ✗ | ✓ |

---

## 8. Middleware Stack

```
Request Flow:

1. rateLimiter          → IP + tenant-level rate limiting (Redis)
2. cors                 → Configured per environment
3. helmet               → Security headers
4. requestId            → Attach UUID for tracing
5. requestLogger        → Structured logging (Pino)
6. bodyParser           → JSON (10MB limit for file metadata)
7. authenticate         → JWT verification → sets req.user, req.tenant
8. tenantContext        → Sets PostgreSQL RLS session variable
9. planGate('feature')  → Checks plan features + usage limits
10. authorize('perm')   → RBAC permission check
11. validate(schema)    → Zod request body/params/query validation
12. [route handler]     → Business logic
13. errorHandler        → Centralized error formatting
14. auditLog            → Async audit trail (via event emitter → BullMQ)
```

---

## 9. Background Jobs (BullMQ)

| Queue | Jobs | Priority |
| --- | --- | --- |
| `email` | Welcome email, password reset, notifications, offer letters, onboarding reminders | High |
| `pdf` | Offer letter generation, total rewards PDFs, report exports, payslip generation | Medium |
| `ai` | HR insights generation, document summarization, benchmark analysis | Medium |
| `reports` | Scheduled report execution, data exports (CSV/Excel) | Low |
| `compliance` | Training deadline checks, compliance alerts, policy acknowledgment reminders | Medium |
| `sync` | Calendar sync, Slack integration sync, payroll data sync | Low |
| `cleanup` | Expired session cleanup, audit log archival, temp file deletion | Low |
| `webhooks` | Outbound webhook delivery with retries | High |

---

## 10. Security Architecture

### 10.1 Authentication

- JWT access tokens (15 min TTL) + refresh tokens (7 day TTL, rotated on use)
- Refresh tokens stored in HttpOnly, Secure, SameSite=Strict cookies
- MFA via TOTP (Google Authenticator, Authy)
- SSO via SAML 2.0 and OIDC (Okta, Azure AD, Google Workspace)
- Account lockout after 5 failed attempts (progressive delay)
- Session management: track active sessions, allow remote logout

### 10.2 Authorization

- Role-Based Access Control (RBAC) with fine-grained permissions
- Resource-level access: managers see only their reports, employees see only their own data
- Field-level access: sensitive fields (salary, SSN) restricted by permission
- API key support for integrations with scoped permissions

### 10.3 Data Protection

- Encryption at rest: AES-256 for database, S3 server-side encryption
- Encryption in transit: TLS 1.3 everywhere
- PII fields encrypted at application level (SSN, bank details)
- Data residency: configurable per tenant for GDPR compliance
- Automatic PII redaction in logs
- GDPR: right to erasure, data export, consent tracking
- SOC 2 Type II compliance target

### 10.4 API Security

- Rate limiting per IP and per tenant (sliding window in Redis)
- Request size limits
- Input sanitization (XSS, SQL injection via parameterized queries)
- CSRF protection for cookie-based auth
- Content Security Policy headers
- Webhook signature verification (HMAC-SHA256)

---

## 11. Caching Strategy

| Data | Cache Layer | TTL | Invalidation |
| --- | --- | --- | --- |
| Plan features | Redis | 5 min | On subscription change |
| Employee list (department) | Redis | 2 min | On employee CRUD |
| Org chart | Redis | 10 min | On reporting line change |
| User permissions | Redis | 5 min | On role assignment change |
| Report results | Redis | 15 min | On re-run |
| Public job listings | CDN | 5 min | On job publish/close |
| Static assets | CDN | 1 year | Hash-based cache busting |

---

## 12. Folder Structure

### 12.1 Backend (Express.js)

```
server/
├── src/
│   ├── config/
│   │   ├── database.ts           # Prisma client + RLS setup
│   │   ├── redis.ts              # Redis connection
│   │   ├── s3.ts                 # S3 client
│   │   ├── queue.ts              # BullMQ setup
│   │   ├── env.ts                # Environment variables (Zod validated)
│   │   └── features.ts           # Feature flag definitions
│   ├── middleware/
│   │   ├── authenticate.ts       # JWT verification
│   │   ├── authorize.ts          # RBAC permission check
│   │   ├── tenantContext.ts      # RLS session variable
│   │   ├── planGate.ts           # Feature gating by plan
│   │   ├── validate.ts           # Zod validation
│   │   ├── rateLimiter.ts        # Rate limiting
│   │   ├── requestLogger.ts      # Structured logging
│   │   ├── errorHandler.ts       # Centralized error handling
│   │   └── upload.ts             # Multer + S3 upload
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schema.ts    # Zod schemas
│   │   │   └── strategies/       # Passport strategies (local, SAML, OIDC)
│   │   ├── employees/
│   │   │   ├── employees.routes.ts
│   │   │   ├── employees.controller.ts
│   │   │   ├── employees.service.ts
│   │   │   └── employees.schema.ts
│   │   ├── hiring/
│   │   │   ├── hiring.routes.ts
│   │   │   ├── hiring.controller.ts
│   │   │   ├── hiring.service.ts
│   │   │   ├── hiring.schema.ts
│   │   │   └── careers.routes.ts  # Public routes (no auth)
│   │   ├── onboarding/
│   │   ├── time-off/
│   │   ├── benefits/
│   │   ├── performance/
│   │   ├── compensation/
│   │   ├── community/
│   │   ├── compliance/
│   │   ├── training/
│   │   ├── surveys/
│   │   ├── signatures/
│   │   ├── workflows/
│   │   ├── reports/
│   │   ├── dashboards/
│   │   ├── ai/
│   │   ├── notifications/
│   │   ├── webhooks/
│   │   └── tenant/
│   ├── jobs/                     # BullMQ job processors
│   │   ├── email.job.ts
│   │   ├── pdf.job.ts
│   │   ├── ai.job.ts
│   │   ├── report.job.ts
│   │   ├── compliance.job.ts
│   │   └── webhook.job.ts
│   ├── events/                   # Internal event bus
│   │   ├── eventBus.ts
│   │   └── handlers/
│   ├── lib/
│   │   ├── prisma.ts             # Prisma client singleton
│   │   ├── logger.ts             # Pino logger
│   │   ├── errors.ts             # Custom error classes
│   │   ├── pagination.ts         # Pagination helper
│   │   └── utils.ts
│   ├── types/                    # Shared TypeScript types
│   ├── app.ts                    # Express app setup
│   └── server.ts                 # Server entry point
├── prisma/
│   ├── schema.prisma             # Prisma schema
│   └── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── scripts/
│   ├── seed.ts                   # Database seeding
│   └── migrate.ts                # Migration runner
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

### 12.2 Frontend (Next.js)

```
client/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/               # Auth layout group
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── forgot-password/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/          # Authenticated layout group
│   │   │   ├── layout.tsx        # Sidebar + top nav
│   │   │   ├── page.tsx          # Dashboard home
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx      # Employee list
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── page.tsx  # Employee profile
│   │   │   │   │   ├── documents/
│   │   │   │   │   ├── history/
│   │   │   │   │   └── time-off/
│   │   │   │   └── new/
│   │   │   ├── hiring/
│   │   │   │   ├── jobs/
│   │   │   │   ├── applicants/
│   │   │   │   └── pipeline/
│   │   │   ├── onboarding/
│   │   │   ├── time-off/
│   │   │   ├── benefits/
│   │   │   ├── performance/
│   │   │   │   ├── reviews/
│   │   │   │   ├── goals/
│   │   │   │   └── one-on-ones/
│   │   │   ├── compensation/
│   │   │   ├── community/
│   │   │   ├── compliance/
│   │   │   ├── training/
│   │   │   ├── surveys/
│   │   │   ├── reports/
│   │   │   ├── settings/
│   │   │   │   ├── general/
│   │   │   │   ├── roles/
│   │   │   │   ├── workflows/
│   │   │   │   ├── integrations/
│   │   │   │   ├── billing/
│   │   │   │   └── webhooks/
│   │   │   └── my/               # Employee self-service
│   │   │       ├── profile/
│   │   │       ├── time-off/
│   │   │       ├── benefits/
│   │   │       ├── goals/
│   │   │       ├── reviews/
│   │   │       └── training/
│   │   ├── careers/              # Public careers page (SSR)
│   │   │   └── [tenantSlug]/
│   │   └── api/                  # Next.js API routes (if needed for BFF)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   ├── layout/               # Sidebar, TopNav, PageHeader
│   │   ├── data-table/           # Reusable data table with sort/filter/pagination
│   │   ├── forms/                # Form field wrappers
│   │   ├── charts/               # Chart wrappers
│   │   ├── rich-text/            # Tiptap editor component
│   │   ├── file-upload/          # Drag & drop file upload
│   │   ├── signature-pad/        # E-signature component
│   │   ├── org-chart/            # Org chart visualization
│   │   └── feature-gate/         # <FeatureGate feature="..." /> wrapper
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useEmployee.ts
│   │   ├── usePermission.ts
│   │   ├── usePlan.ts
│   │   └── use[Module].ts
│   ├── lib/
│   │   ├── api.ts                # Axios/fetch wrapper with auth
│   │   ├── queryClient.ts        # TanStack Query config
│   │   └── utils.ts
│   ├── stores/                   # Zustand stores
│   │   ├── authStore.ts
│   │   ├── uiStore.ts
│   │   └── notificationStore.ts
│   ├── types/                    # Shared types (ideally from shared package)
│   └── styles/
│       └── globals.css           # Tailwind directives
├── public/
├── next.config.js
├── tailwind.config.js
├── package.json
└── tsconfig.json
```

---

## 13. Going Beyond — Features That Make You Better

These features go beyond the reference platform you shared and differentiate HRForge:

### 13.1 Smart Onboarding Engine

Adaptive onboarding that changes based on role, department, and location. IT provisioning tickets auto-created. Buddy system matching. Progress visible to HR, manager, and new hire.

### 13.2 AI-Powered Writing Assistant

Draft job descriptions, performance review summaries, offer letters, and policy documents using AI. Tone and compliance checking built in.

### 13.3 Predictive Attrition Risk

ML model trained on employee data (tenure, satisfaction scores, compensation percentile, manager changes) to flag flight risk. Dashboard for HR leadership.

### 13.4 Compensation Equity Analyzer

Real-time pay equity analysis across gender, ethnicity, and tenure. Automatic flagging of outliers. Exportable for compliance reporting.

### 13.5 Employee Journey Timeline

Unified visual timeline per employee: hire → onboarding → training → reviews → promotions → compensation changes → milestones. Every event in one view.

### 13.6 Slack / Teams Deep Integration

Approve time off, submit feedback, get onboarding reminders, and interact with the AI assistant directly from Slack or MS Teams.

### 13.7 Public API & Marketplace

Documented public API for customers to build integrations. App marketplace for third-party HR tools (payroll providers, background check services, LMS).

### 13.8 Org Chart with Scenario Planning

Visual org chart with drag-and-drop reorg planning. "What if" scenarios for restructuring with headcount and cost impact.

### 13.9 Employee Self-Service Mobile App (PWA)

Submit time off, view payslips, sign documents, complete training — all from mobile. Push notifications for approvals.

### 13.10 Advanced Audit & Compliance Reporting

Every action logged. SOC 2-ready audit export. GDPR data access and erasure workflows. Compliance calendar with jurisdiction-specific deadlines.

---

## 14. Development Phases

### Phase 1: Foundation (Weeks 1–8)

Auth, multi-tenancy, employee records, org structure, RBAC, basic UI shell, subscription/billing integration.

### Phase 2: Core HR (Weeks 9–16)

Time off, benefits tracking, document management, e-signatures, workflows & approvals, onboarding, email templates.

### Phase 3: Hiring (Weeks 17–22)

ATS, job postings, hiring pipeline, applicant tracking, scorecards, offer letters, public careers page.

### Phase 4: Performance & Growth (Weeks 23–30)

Review cycles, 360° feedback, goals/OKRs, 1:1 management, training/compliance courses, surveys.

### Phase 5: Compensation & Analytics (Weeks 31–36)

Compensation bands, comp reviews, total rewards, standard reports, custom reports, dashboards.

### Phase 6: Community & AI (Weeks 37–42)

Employee community, announcements, interest groups, AI assistant, insights engine, benchmarks.

### Phase 7: Polish & Scale (Weeks 43–48)

Public API, webhooks, marketplace foundations, mobile PWA, advanced security, SOC 2 prep, performance optimization.

---

## 15. Deployment Architecture

```
                    ┌──────────────┐
                    │  CloudFlare  │
                    │   CDN/WAF    │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼──────────┐   ┌─────────▼──────────┐
    │   Vercel / CDN     │   │   AWS ALB           │
    │   (Next.js SSR)    │   │   (API Gateway)     │
    └────────────────────┘   └─────────┬───────────┘
                                       │
                            ┌──────────▼──────────┐
                            │  ECS Fargate Cluster │
                            │  ┌────────────────┐  │
                            │  │ Express API ×3  │  │
                            │  │ (auto-scaling)  │  │
                            │  └────────────────┘  │
                            │  ┌────────────────┐  │
                            │  │ Worker ×2       │  │
                            │  │ (BullMQ jobs)   │  │
                            │  └────────────────┘  │
                            └──────────┬───────────┘
                                       │
              ┌────────────┬───────────┼───────────┐
              │            │           │           │
     ┌────────▼───┐ ┌─────▼────┐ ┌────▼────┐ ┌───▼────┐
     │ PostgreSQL │ │  Redis   │ │   S3    │ │Elastic │
     │ RDS (Multi │ │Elasticach│ │         │ │Search  │
     │ AZ + RR)  │ │          │ │         │ │        │
     └────────────┘ └──────────┘ └─────────┘ └────────┘
```

---

## 16. Monitoring & Observability

| Concern | Tool | What to Track |
| --- | --- | --- |
| APM | Datadog / New Relic | Request latency (p50/p95/p99), error rates, throughput |
| Logs | Pino → ELK / Datadog | Structured JSON logs, correlation IDs |
| Errors | Sentry | Unhandled exceptions, breadcrumbs |
| Uptime | Better Uptime / Pingdom | API health, critical endpoint availability |
| Database | pg_stat_statements | Slow queries, connection pool health |
| Queues | BullMQ dashboard (Bull Board) | Job success/failure rates, queue depth |
| Business | Custom dashboards | Signups, active tenants, MRR, feature adoption |

---

*This document serves as the living blueprint for HRForge. Each section should be expanded into detailed specs as development begins. Review and update quarterly.*