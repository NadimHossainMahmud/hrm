# HRForge — Phased Development Roadmap

**Total Phases:** 20

**Estimated Duration:** ~24 months (March 2026 → May 2028)

**Team Size Recommendation:** 2–3 fullstack devs (Phase 0–8), scale to 4–6 (Phase 9+)

---

## How to Read This Plan

Each phase is designed to be **shippable independently**. The Core plan features are built first (Phases 0–11), so you can start selling and onboarding customers early. Pro and Elite features layer on top without breaking existing functionality.

**Dependencies** are listed for each phase — never start a phase until its dependencies are stable.

**MVP Checkpoint** is marked at Phase 9 — this is when you can launch the Core plan publicly.

---

## Phase 0 — Project Setup & Infrastructure

**Duration:** 2 weeks

**Dependencies:** None

**Goal:** Every developer can clone, run, and deploy in under 10 minutes.

| Task | Details |
| --- | --- |
| Monorepo setup | Turborepo with `apps/web` (Next.js), `apps/api` (Express), `packages/shared` (Zod schemas, types) |
| Docker Compose | PostgreSQL 16, Redis 7, MinIO (S3-compatible), Elasticsearch — one command local dev |
| CI/CD pipeline | GitHub Actions: lint → test → build → deploy to staging on merge to `main` |
| Express boilerplate | TypeScript, Pino logger, error handler, health check endpoint |
| Next.js boilerplate | App Router, Tailwind CSS, shadcn/ui installed, dark mode toggle |
| Shared package | Zod schemas for validation (shared between front + back), TypeScript types |
| Environment config | `.env` validation with Zod, separate configs for dev/staging/prod |
| Database tooling | Prisma setup, initial migration, seed script structure |
| Code quality | ESLint, Prettier, Husky pre-commit hooks, commitlint |
| Testing setup | Vitest (unit), Supertest (API integration), Playwright (E2E) |

**Deliverables:**

- Running local dev environment with all services
- CI pipeline green on empty repo
- Deployed staging environment (Railway or AWS)

---

## Phase 1 — Authentication & Multi-Tenancy

**Duration:** 5 weeks

**Dependencies:** Phase 0

**Goal:** Secure multi-tenant foundation. Every request is tenant-scoped.

| Task | Details |
| --- | --- |
| Tenant schema | `tenants`, `users`, `roles`, `permissions`, `role_permissions`, `user_roles` tables |
| PostgreSQL RLS | Row-level security policies on all tenant-scoped tables, session variable `app.current_tenant` |
| Tenant registration | `POST /v1/auth/register` — creates tenant + admin user in transaction |
| Login / Logout | `POST /v1/auth/login` / `POST /v1/auth/logout` — email/password, JWT issuance |
| JWT system | Access token (15min) + Refresh token (7d, HttpOnly cookie, rotated on use) |
| Password reset | Forgot password → email token → reset endpoint |
| MFA (TOTP) | Enable/disable MFA, QR code generation, TOTP verification on login |
| RBAC engine | `authorize('employees.write')` middleware, check user's roles → permissions |
| Default roles | System roles: `super_admin`, `admin`, `hr_manager`, `manager`, `employee` with default permission sets |
| Auth UI | Login, Register (tenant creation), Forgot Password, MFA Setup pages |
| Dashboard shell | Sidebar navigation, top bar with user menu, role-based menu visibility |
| Tenant context middleware | Extracts `tenant_id` from JWT, sets PG session variable for RLS |
| Middleware pipeline | `rateLimiter → authenticate → tenantContext → authorize → validate → handler → errorHandler` |
| Audit log | Append-only `audit_logs` table, async logging via event emitter |

**Deliverables:**

- Multi-tenant auth working end-to-end
- Users can register a company, log in, see empty dashboard
- RLS tested: Tenant A cannot see Tenant B data
- RBAC tested: Employee cannot access admin routes

---

## Phase 2 — Core HR & Employee Management

**Duration:** 5 weeks

**Dependencies:** Phase 1

**Goal:** Complete employee lifecycle management — the heart of the platform.

| Task | Details |
| --- | --- |
| Employee CRUD API | Full REST API with search, filter, pagination, includes (department, manager) |
| Employee list UI | Data table with server-side sort/filter/search, column customization |
| Employee profile | Tabbed profile page: Personal, Employment, Compensation, Documents, History |
| Departments | CRUD with hierarchy (parent/child), department head assignment |
| Teams | CRUD, link to department, team lead |
| Locations | CRUD with address, timezone, HQ flag |
| Org structure UI | Department tree view, team listing, location cards |
| Org chart | D3-based org chart visualization from manager → direct reports hierarchy |
| Job levels & bands | CRUD for levels (IC1–IC5, M1–M4), salary bands per level |
| Employee history | Auto-track changes (title, salary, department, manager) with effective dates |
| Document management | Upload to S3, categorize (contract, ID, certificate), expiry tracking |
| Emergency contacts | CRUD per employee |
| Employee self-service | Employees view/edit own profile (gated fields), view own documents |
| CSV import | Upload CSV → preview → validate → bulk create employees |
| CSV/Excel export | Export filtered employee list to CSV or Excel |
| Employee directory | Searchable company directory with photo, title, department, contact |
| Custom fields | JSONB-based custom fields per tenant (admin configurable) |

**Deliverables:**

- Full employee management working
- Org chart renders correctly
- Employee self-service portal functional
- Bulk import tested with 500+ records

---

## Phase 3 — Subscription & Billing

**Duration:** 3.5 weeks

**Dependencies:** Phase 1

**Goal:** Monetization layer. Tenants can subscribe, upgrade, and be gated by plan.

| Task | Details |
| --- | --- |
| Plans schema | `plans`, `plan_features` tables seeded with Core/Pro/Elite definitions |
| Feature flag registry | Centralized `FEATURES` config mapping feature keys to plan tiers and limits |
| Plan gate middleware | `planGate('performance_management')` — checks plan, returns 403 with upgrade prompt |
| Stripe integration | Stripe Checkout for subscription creation, Stripe Portal for management |
| Webhook handling | Stripe webhooks for `subscription.updated`, `invoice.paid`, `subscription.deleted` |
| Usage tracking | Track seat count, active job openings, training courses against plan limits |
| Subscription UI | Settings → Billing: current plan, upgrade/downgrade, payment method, invoices |
| Trial flow | 14-day free trial on Elite, auto-downgrade to Core if no payment |
| Plan comparison page | Feature matrix page showing Core vs Pro vs Elite |

**Deliverables:**

- Stripe billing working end-to-end
- Plan gating enforced on all gated endpoints
- Usage limits enforced (e.g., 5 job openings on Core)
- Trial → paid conversion flow working

---

## Phase 4 — Notification Engine & Workflow System

**Duration:** 4 weeks

**Dependencies:** Phase 1, Phase 2

**Goal:** Cross-cutting notification and approval infrastructure used by every feature after this.

| Task | Details |
| --- | --- |
| BullMQ setup | Redis-backed queues: `email`, `pdf`, `reports`, `webhooks`, `compliance`, `ai` |
| Notification model | `notifications` table with type, resource link, read/unread status |
| In-app notifications | Real-time via Socket.io, notification bell with unread count |
| Email notifications | MJML templates, Nodemailer with SendGrid/SES, queue-based sending |
| Notification preferences | Per-user settings: which events trigger in-app, email, or both |
| Notification UI | Notification dropdown, notification center page, mark all as read |
| Workflow template builder | Admin defines approval chains: sequential/parallel, by role or specific user |
| Workflow execution engine | On trigger (time off, compensation, etc.), create instance, advance through steps |
| Approval inbox | "My Pending Approvals" page with approve/reject actions |
| Workflow conditions | Auto-approve after N days, skip step if condition met, escalation rules |

**Deliverables:**

- Real-time notifications working (bell icon updates live)
- Email notifications sending reliably
- Workflow engine can run multi-step approvals
- Approval inbox shows pending items

---

## Phase 5 — Hiring & ATS

**Duration:** 6 weeks

**Dependencies:** Phase 2, Phase 3 (for job limit gating), Phase 4 (notifications)

**Goal:** Full applicant tracking system with plan-based job limits (5/25/50).

| Task | Details |
| --- | --- |
| Job posting CRUD | Create/edit job postings with rich description, requirements, salary range |
| Job status management | Draft → Published → Paused → Closed → Filled lifecycle |
| Hiring pipelines | Customizable stage pipelines (Applied → Screen → Interview → Offer → Hired) |
| Public careers page | SSR Next.js page at `careers.hrforge.com/{tenant-slug}`, SEO optimized |
| Application form | Public application with resume upload, cover letter, LinkedIn URL |
| Applicant tracking | List all applicants with filters (stage, job, rating, source) |
| Kanban board | Drag-and-drop applicant stage board per job posting |
| Interview scheduling | Schedule interviews, send calendar invites (Google Calendar integration later) |
| Scorecards | Interviewers fill structured scorecards with ratings and recommendations |
| Offer letter templates | HTML templates with merge fields (name, salary, start date, etc.) |
| Offer generation | Generate PDF offer letter from template, send to candidate for e-signature |
| Candidate portal | Candidates view offer, accept/decline, upload signed documents |
| Hire conversion | One-click convert accepted applicant → new employee record |
| Referral tracking | Link applicants to referring employees |
| Hiring analytics | Funnel metrics: time-to-hire, source effectiveness, stage conversion rates |
| Job limit enforcement | Core: 5 open jobs, Pro: 25, Elite: 50 — enforced at API |

**Deliverables:**

- Complete ATS with Kanban board
- Public careers page live
- Offer letter flow end-to-end
- Applicant → Employee conversion working

---

## Phase 6 — Onboarding

**Duration:** 4.5 weeks

**Dependencies:** Phase 2, Phase 4, Phase 5 (hire conversion triggers onboarding)

**Goal:** Structured onboarding from day-0 to fully productive employee.

| Task | Details |
| --- | --- |
| Onboarding templates | Admin creates reusable templates with ordered task lists per department/role |
| Template tasks | Each task has: assignee type (new hire/manager/HR/IT/buddy), due day offset, category |
| Session creation | Auto-triggered when employee is hired, or manually created by HR |
| Task engine | Assign tasks to specific users based on template rules, calculate due dates from start date |
| Task tracking UI | Checklist view for each stakeholder showing their assigned tasks |
| New hire packet | Collection of documents to sign/acknowledge (NDA, handbook, tax forms, direct deposit) |
| E-signature system | Canvas-based signature capture → embed into PDF → store with audit trail (IP, timestamp, user agent) |
| Document templates | Rich text templates with merge fields: `{{employee.first_name}}`, `{{company.name}}`, etc. |
| Document generation | Render templates to PDF using Puppeteer, store in S3 |
| Onboarding dashboard | HR view: all active onboardings, progress bars, overdue tasks, bottlenecks |
| Manager onboarding view | Manager sees their new hires' onboarding progress |
| New hire portal | New hire sees their checklist, pending documents, welcome message |
| Buddy system | Assign a buddy to new hires, buddy gets their own task list |

**Deliverables:**

- Onboarding auto-triggers on hire
- E-signature legally binding (audit trail)
- New hire packet flow complete
- Onboarding progress visible to all stakeholders

---

## Phase 7 — Time Off & Leave Management

**Duration:** 4.5 weeks

**Dependencies:** Phase 2, Phase 4 (workflows for approval)

**Goal:** Flexible time off policies with accrual engine and team calendar.

| Task | Details |
| --- | --- |
| Policy engine | Create policies: type, accrual type (fixed/accrual/unlimited), carryover, waiting period |
| Policy assignment | Assign policies to all employees or filtered by department/location/employment type |
| Accrual calculator | Monthly/biweekly/yearly accrual based on policy, handles mid-year hires prorated |
| Balance tracking | Current balance = entitled + carried_over + adjustments - used - pending |
| Request flow | Employee submits request (start/end date, half-day support, reason) |
| Approval integration | Request triggers workflow engine → manager approves/rejects with comments |
| Team calendar | Calendar view showing team's approved and pending time off, holidays |
| Company holidays | Admin manages holidays, recurring holidays, location-specific holidays |
| Balance adjustments | Admin can manually adjust balances with reason |
| Conflict detection | Warn if too many team members off on same day |
| Self-service UI | Employee: view balances, request time off, see history, cancel pending |
| Manager UI | Manager: approve/reject queue, team calendar, team balances overview |
| Year-end processing | Carryover calculation, balance reset for new year |
| Time off reports | Usage by department, remaining balances, trends |

**Deliverables:**

- Accrual engine handles all policy types correctly
- Half-day requests supported
- Team calendar working
- Year-end carryover tested

---

## Phase 8 — Benefits Tracking

**Duration:** 3 weeks

**Dependencies:** Phase 2

**Goal:** Benefits plan management with enrollment during open and qualifying events.

| Task | Details |
| --- | --- |
| Benefit plan CRUD | Create health, dental, vision, 401k, life, HSA plans with costs and coverage levels |
| Open enrollment | Configure enrollment window (start/end dates), send reminders |
| Employee enrollment | Self-service enrollment: browse plans, select coverage level, add dependents |
| Dependent management | Add/edit dependents (name, relationship, DOB) for coverage |
| Benefit election overview | Employee dashboard showing all active benefits, costs, coverage |
| Qualifying life events | Marriage, new child, job change → trigger special enrollment window |
| Waiver tracking | Track employees who waive coverage with reason |
| Benefits reports | Enrollment rates, cost analysis per plan, coverage distribution |

**Deliverables:**

- Open enrollment flow working end-to-end
- Employees can self-enroll and manage dependents
- Benefits overview dashboard functional

---

## ★ MVP CHECKPOINT — Core Plan Launch Ready ★

**At this point (after Phase 8), the Core plan is feature-complete:**

- Auth + multi-tenancy + RBAC ✓
- Employee records + org structure ✓
- Subscription billing ✓
- Notifications + workflows ✓
- Hiring with 5 job openings ✓
- Onboarding + e-signatures ✓
- Time off + leave management ✓
- Benefits tracking ✓
- AI data insights (basic) — add minimal AI queries here ✓

**You can launch the Core plan now and start generating revenue while building Pro/Elite features.**

---

## Phase 9 — Reports & Standard Analytics

**Duration:** 5 weeks

**Dependencies:** Phase 2, Phase 5, Phase 7, Phase 8 (data must exist to report on)

**Goal:** Reporting engine that powers all current and future analytics.

| Task | Details |
| --- | --- |
| Report engine | Generic query builder: select fields, filters, group by, sort, date ranges |
| Headcount report | Active employees by department, location, employment type over time |
| Turnover report | Terminations, turnover rate by period/department, voluntary vs involuntary |
| Demographics report | Age, gender, tenure distribution with visualizations |
| Time off usage | Usage by policy type, department, trends over time |
| Compensation overview | Salary distribution by department, level, compa-ratio analysis |
| Hiring funnel | Applications → stages → hires, conversion rates, time metrics |
| Saved reports | Save report configurations, share with other users |
| Scheduled reports | Schedule reports to run weekly/monthly, email PDF/Excel to recipients |
| Export engine | Export any report to CSV, Excel, or PDF |
| Report permissions | Reports visible based on role (HR sees all, managers see their department) |

**Deliverables:**

- 6 standard reports working with real data
- Reports exportable in 3 formats
- Scheduled reports delivering via email

---

## Phase 10 — Compliance & Training

**Duration:** 5 weeks

**Dependencies:** Phase 2, Phase 4 (notifications for deadlines), Phase 3 (training limits)

**Goal:** Compliance tracking and LMS with plan-tiered course limits (1/15/300+).

| Task | Details |
| --- | --- |
| Compliance requirements | Track regulations by jurisdiction, category, due dates, recurrence |
| Compliance dashboard | Org-wide compliance status: compliant, at risk, overdue |
| Compliance alerts | Auto-notify HR and employees of upcoming deadlines |
| Course management | Create courses: title, content type (video, SCORM, document, quiz, link), duration |
| Content hosting | Upload video/documents to S3, SCORM package support, external link courses |
| Course assignment | Assign courses to individuals, departments, or by compliance requirement |
| Enrollment tracking | Track status: assigned → in progress → completed/overdue |
| Progress tracking | Track time spent, sections completed, resume from last position |
| Quiz engine | Multiple choice quizzes with configurable passing score |
| Certificate generation | Auto-generate PDF certificates on course completion |
| Training reports | Completion rates, overdue trainings, compliance coverage |
| Course limit enforcement | Core: 1 course, Pro: 15, Elite: 300+ — enforced at API |

**Deliverables:**

- LMS working with all content types
- Quiz + certificate flow complete
- Compliance dashboard showing real status
- Plan-based course limits enforced

---

## Phase 11 — Employee Experience (Surveys)

**Duration:** 4 weeks

**Dependencies:** Phase 2, Phase 4

**Goal:** Measure employee satisfaction and wellbeing through surveys.

| Task | Details |
| --- | --- |
| Survey builder | Drag-and-drop question builder: rating, NPS, multiple choice, text, scale |
| Survey distribution | Target by department/team/location, schedule launch date, set deadline |
| Anonymous responses | Token-based anonymity — prevent duplicates without linking to identity |
| Pulse surveys | Recurring surveys (weekly/monthly/quarterly) with same questions for trend tracking |
| eNPS tracking | Employee Net Promoter Score calculation and trending |
| Response collection | Clean UI for employees to respond, progress indicator, save draft |
| Results dashboard | Aggregate scores, breakdowns by question/department, word clouds for text |
| Wellbeing module | Pre-built wellbeing survey template, wellbeing score tracking over time |
| Satisfaction trends | Historical satisfaction scores with department and team drill-down |
| Results export | Export results to CSV/PDF for leadership presentations |
| Benchmark comparison | Compare scores against previous periods (vs industry in Elite — Phase 16) |

**Deliverables:**

- Survey builder creating and distributing surveys
- Anonymous responses verified secure
- eNPS tracking with trend charts
- Wellbeing check-ins working

---

## Phase 12 — Performance Management *(Pro + Elite)*

**Duration:** 7 weeks

**Dependencies:** Phase 2, Phase 4, Phase 3 (plan gating)

**Goal:** Complete performance management suite — reviews, goals, 360°, 1:1s.

| Task | Details |
| --- | --- |
| Review cycles | Admin creates cycles: annual, quarterly, probation — sets timeline and review types |
| Review templates | Build templates with sections (competencies, goals, values) and question types |
| Self-review | Employee fills self-assessment using cycle template |
| Manager review | Manager evaluates direct reports, sees self-review, provides ratings + comments |
| Peer review nomination | Employee or manager nominates peers for feedback |
| 360° feedback | Collect feedback from peers, direct reports, cross-functional collaborators |
| Review summary | Aggregated view: all ratings, comments by type, overall rating |
| Calibration | HR view: compare ratings across teams, adjust for consistency, 9-box grid |
| Review acknowledgment | Employee acknowledges (not necessarily agrees with) completed review |
| Goals CRUD | Create individual/team/department/company goals with key results |
| OKR alignment | Cascade company goals → department → team → individual, visual alignment tree |
| Goal progress | Update progress on key results, auto-calculate goal completion percentage |
| Goal check-ins | Periodic progress updates with notes |
| 1:1 management | Schedule recurring 1:1s between manager and report |
| 1:1 notes | Shared and private notes, action items with due dates and completion tracking |
| 1:1 history | Full history of past 1:1s with notes and action items |
| Performance dashboard | Cycle progress, completion rates, rating distribution, calibration view |

**Deliverables:**

- Full review cycle from creation to employee acknowledgment
- 360° feedback collecting from multiple reviewer types
- OKRs with cascading alignment
- 1:1 meetings with action item tracking

---

## Phase 13 — Compensation Management *(Pro + Elite)*

**Duration:** 5 weeks

**Dependencies:** Phase 2, Phase 4, Phase 12 (performance data feeds comp decisions)

**Goal:** Data-driven compensation management with equity analysis.

| Task | Details |
| --- | --- |
| Compensation bands | Define salary bands by level × job family × location, min/mid/max |
| Compa-ratio engine | Calculate compa-ratio (salary / midpoint) for all employees, flag outliers |
| Comp review cycles | Create annual/ad-hoc compensation review with budget pool |
| Salary proposals | Managers propose salary changes (merit, promotion, market, equity) |
| Multi-level approval | HR reviews → VP approves → Finance signs off (configurable chain) |
| Budget tracking | Real-time budget remaining as proposals are approved |
| Total rewards statements | Auto-generate annual statements: salary + bonus + equity + benefits + retirement |
| Pay equity visualization *(Elite)* | Scatter plots by gender/ethnicity/tenure, flag statistically significant gaps |
| Comp benchmarking *(Elite)* | Market data integration, percentile positioning, gap analysis |
| Compensation reports | Average salary by level, comp review summary, budget utilization |

**Deliverables:**

- Comp review cycle running end-to-end
- Compa-ratio calculated across org
- Total rewards PDFs generated
- Pay equity analysis flagging gaps (Elite)

---

## Phase 14 — Employee Community *(Pro + Elite)*

**Duration:** 3.5 weeks

**Dependencies:** Phase 2, Phase 3 (plan gating)

**Goal:** Internal social platform for culture and engagement.

| Task | Details |
| --- | --- |
| Community feed | Scrollable feed with posts sorted by recency, pinned posts at top |
| Rich media posts | Tiptap editor for formatted text, images, videos, file attachments |
| Internal announcements | Company-wide or department-scoped announcements by HR/leadership |
| Comments & reactions | Threaded comments on posts, like/react functionality |
| Interest groups | Create/join groups (e.g., "Book Club", "Remote Workers"), group-scoped posts |
| Polls | Create polls within posts, real-time vote counting, results display |
| Shoutouts/recognition | "@employee great job on X" — tagged shoutouts visible in feed |
| Moderation | Admin can pin, delete, or hide posts/comments, report system |
| Notification integration | Notify on mentions, comments on your posts, group activity |

**Deliverables:**

- Community feed with rich media working
- Interest groups with membership
- Shoutouts visible in feed and on employee profiles

---

## Phase 15 — AI & HR Intelligence

**Duration:** 6 weeks

**Dependencies:** Phase 2, Phase 9 (reports data), Phase 11 (survey data), Phase 12 (performance data)

**Goal:** AI layer that makes HRForge smarter than competitors.

| Task | Details |
| --- | --- |
| AI assistant UI | Chat interface in sidebar, context-aware based on current page |
| HR data Q&A (Core) | "How many employees joined this quarter?" — queries database, returns answers |
| Policy Q&A (Pro) | "What's our parental leave policy?" — RAG over uploaded company policies |
| AI job description writer | Generate job descriptions from title + requirements, tone customization |
| AI review summarizer | Summarize all feedback for an employee into key themes |
| AI offer letter drafter | Generate offer letter content from job + candidate + comp details |
| AI data insights | Auto-generate insights: "Turnover in Engineering is 2× company average" |
| Benchmark analysis (Elite) | "How does our turnover compare to industry?" — AI analysis of benchmark data |
| Predictive attrition (Elite) | ML model: tenure + satisfaction + comp percentile + manager changes → flight risk score |
| AI recommendations | Proactive suggestions: "3 employees have reviews overdue", "Comp outlier detected" |
| AI safety rails | Prompt injection prevention, PII redaction in AI context, rate limiting per tenant |

**Deliverables:**

- AI chat working with tiered capabilities per plan
- Predictive attrition model trained and producing risk scores
- AI insights appearing on HR dashboard

---

## Phase 16 — Elite Tier Features

**Duration:** 4.5 weeks

**Dependencies:** Phase 9, Phase 11, Phase 13, Phase 15

**Goal:** Premium features that justify the Elite price point.

| Task | Details |
| --- | --- |
| Custom dashboard builder | Drag-and-drop widget placement, resize, configurable data sources |
| Dashboard widgets | Headcount, turnover, satisfaction score, time-off calendar, hiring funnel, custom charts |
| Advanced visualizations | D3-based: heatmaps, sankey diagrams (employee flow), geographic distribution |
| Secure sharing | Share dashboards with specific roles/users, view-only permissions |
| Turnover benchmarks | Compare org turnover against industry/size-segment benchmarks |
| Age & gender benchmarks | Demographic comparison with market data |
| Satisfaction benchmarks | Compare eNPS and satisfaction against peer companies |
| Premium services portal | Admin training scheduling, data integrity service requests, implementation tracking |
| Exclusive webinars | Content hub for Elite customers: upcoming webinars, recordings, learning paths |

**Deliverables:**

- Custom dashboards fully functional
- 3 benchmark categories with visualizations
- Premium services portal accessible

---

## Phase 17 — Integrations & Public API

**Duration:** 5.5 weeks

**Dependencies:** Phase 1 (auth), Phase 4 (webhooks), all feature phases

**Goal:** Connect HRForge to the customer's tool ecosystem and enable API-driven extensions.

| Task | Details |
| --- | --- |
| SSO (SAML 2.0) | Okta, OneLogin, Azure AD SAML integration |
| SSO (OIDC) | Google Workspace, Azure AD OIDC integration |
| Slack integration | Approve time off, receive notifications, ask AI questions in Slack |
| Google Calendar sync | Sync interviews, 1:1s, time off to Google Calendar |
| Webhook system | Admin registers webhook URLs, select events, HMAC-SHA256 signed payloads |
| Webhook delivery | Queue-based delivery with exponential backoff retry (3 attempts) |
| Webhook logs | Delivery history with payload, response code, retry status |
| Public API (v1) | RESTful API with API key auth, scoped permissions, rate limiting |
| API documentation | OpenAPI 3.0 spec auto-generated, interactive Swagger UI |
| API key management | Generate/revoke API keys with scoped permissions per key |
| Developer portal | Documentation site with guides, code samples, and API reference |

**Deliverables:**

- SSO working with Okta and Google Workspace
- Slack approve/notify integration live
- Public API documented and accessible
- Webhook delivery reliable with retry

---

## Phase 18 — Mobile & Polish

**Duration:** 4.5 weeks

**Dependencies:** All feature phases

**Goal:** Mobile experience and production polish.

| Task | Details |
| --- | --- |
| PWA setup | Service worker, web app manifest, install prompt |
| Mobile layouts | Responsive redesign of key views: dashboard, employee list, time off, approvals |
| Mobile time off | Submit/view time off requests optimized for mobile |
| Mobile approvals | Approve/reject requests with swipe gestures |
| Mobile training | Complete training courses on mobile |
| Push notifications | Web push notifications for approvals, mentions, deadlines |
| Offline support | Cache critical data (own profile, pending tasks) for offline viewing |
| Accessibility audit | WCAG 2.1 AA compliance: keyboard navigation, screen reader, contrast ratios |
| Performance optimization | Lighthouse audit, lazy loading, code splitting, image optimization |
| i18n framework | Set up next-intl, extract all strings, support English + 1 additional language |
| UX polish | Loading states, empty states, error states, micro-animations, toast notifications |

**Deliverables:**

- PWA installable on mobile
- Key flows working on mobile
- Lighthouse score > 90 on all metrics
- WCAG 2.1 AA compliant

---

## Phase 19 — Security & Compliance Hardening

**Duration:** 5.5 weeks

**Dependencies:** All feature phases

**Goal:** Production-grade security. SOC 2 and GDPR ready.

| Task | Details |
| --- | --- |
| Penetration testing | Engage third-party pen test firm, remediate findings |
| SOC 2 Type II prep | Document controls, evidence collection, policy documentation |
| GDPR tools | Data access request flow (employee requests all their data) |
| Right to erasure | Anonymize/delete employee data with cascade handling |
| Consent management | Track consent for data processing, cookie consent |
| Advanced audit export | Export audit logs in SOC 2 format, date-range filtered |
| PII encryption | Application-level encryption for SSN, bank details, personal ID numbers |
| Data retention policies | Configurable retention periods, auto-archive/delete old data |
| Disaster recovery | Automated database backups, point-in-time recovery testing |
| Load testing | k6 load tests: 1000 concurrent users, identify bottlenecks |
| Auto-scaling | Configure ECS auto-scaling rules based on CPU/memory/request count |
| Rate limit tuning | Fine-tune per-endpoint rate limits based on load test data |
| Security headers | Final review: CSP, HSTS, X-Frame-Options, X-Content-Type-Options |

**Deliverables:**

- Pen test report with all critical/high findings remediated
- SOC 2 evidence package ready for auditor
- GDPR data access + erasure flows working
- System handles 1000+ concurrent users

---

## Phase 20 — Launch Preparation & Go-Live

**Duration:** 6 weeks

**Dependencies:** All phases

**Goal:** Ship it. Real customers. Real data.

| Task | Details |
| --- | --- |
| Staging environment | Production-mirror staging with realistic data volumes |
| End-to-end testing | Full E2E test suite covering all critical user journeys (Playwright) |
| Seed data | Demo tenants with realistic fake data for sales demos |
| Marketing site | Landing page, pricing page, feature pages, blog (Next.js) |
| Documentation | Help center: getting started guides, feature docs, FAQs, video walkthroughs |
| Onboarding wizard | New tenant setup: company info → invite users → import employees → configure policies |
| Beta program | 10 real companies on free access, structured feedback collection |
| Beta feedback | Triage and fix critical bugs, UX improvements based on feedback |
| Production infrastructure | Final AWS setup: multi-AZ database, ElastiCache, S3, CloudFront, WAF |
| Monitoring & alerting | Datadog dashboards, PagerDuty alerts for downtime, error rate spikes |
| Runbook | Incident response procedures, rollback playbook, escalation chain |
| Launch checklist | DNS, SSL, backup verification, monitoring verified, legal (ToS, privacy policy) |
| **PUBLIC LAUNCH** | 🚀 |

**Deliverables:**

- Production environment live and monitored
- 10 beta companies validated the product
- Marketing site driving signups
- Support documentation complete

---

## Phase Summary Table

| Phase | Name | Duration | Plan Tier | Key Deliverable |
| --- | --- | --- | --- | --- |
| 0 | Project Setup | 2 weeks | — | Dev environment running |
| 1 | Auth & Multi-Tenancy | 5 weeks | All | Secure multi-tenant foundation |
| 2 | Core HR & Employees | 5 weeks | All | Employee lifecycle management |
| 3 | Subscription & Billing | 3.5 weeks | All | Stripe billing + plan gating |
| 4 | Notifications & Workflows | 4 weeks | All | Real-time notifications + approvals |
| 5 | Hiring & ATS | 6 weeks | All (gated limits) | Full applicant tracking system |
| 6 | Onboarding | 4.5 weeks | All | Structured onboarding + e-signatures |
| 7 | Time Off & Leave | 4.5 weeks | All | Flexible leave management |
| 8 | Benefits Tracking | 3 weeks | All | Benefits enrollment portal |
| **★** | **MVP CHECKPOINT** | — | **Core** | **Launch Core plan — start revenue** |
| 9 | Reports & Analytics | 5 weeks | All | Reporting engine + 6 standard reports |
| 10 | Compliance & Training | 5 weeks | All (gated limits) | LMS + compliance tracking |
| 11 | Employee Experience | 4 weeks | All | Surveys + eNPS + wellbeing |
| 12 | Performance Management | 7 weeks | Pro + Elite | Reviews + goals + 1:1s |
| 13 | Compensation Management | 5 weeks | Pro + Elite | Comp reviews + pay equity |
| 14 | Employee Community | 3.5 weeks | Pro + Elite | Internal social platform |
| 15 | AI & HR Intelligence | 6 weeks | All (tiered) | AI assistant + predictive analytics |
| 16 | Elite Features | 4.5 weeks | Elite | Custom dashboards + benchmarks |
| 17 | Integrations & API | 5.5 weeks | All | SSO + Slack + Public API |
| 18 | Mobile & Polish | 4.5 weeks | All | PWA + accessibility + i18n |
| 19 | Security Hardening | 5.5 weeks | All | SOC 2 + GDPR + pen test |
| 20 | Launch Prep | 6 weeks | All | Beta → Public launch 🚀 |
|  | **TOTAL** | **~97 weeks** |  |  |

---

## Dependency Graph

`Phase 0 (Setup)
  └─→ Phase 1 (Auth)
        ├─→ Phase 2 (Employees) ─────→ Phase 5 (Hiring) ───→ Phase 6 (Onboarding)
        │     ├─→ Phase 7 (Time Off)
        │     ├─→ Phase 8 (Benefits) ─── ★ MVP CHECKPOINT ★
        │     ├─→ Phase 9 (Reports) ──→ Phase 15 (AI) ──→ Phase 16 (Elite)
        │     ├─→ Phase 11 (Surveys) ──→ Phase 15 (AI)
        │     └─→ Phase 12 (Performance) ──→ Phase 13 (Compensation)
        ├─→ Phase 3 (Billing) ─→ Phase 5, 10, 12, 14, 16
        └─→ Phase 4 (Notifications) ─→ Phase 5, 6, 7, 10, 11, 12, 14
                                         └─→ Phase 17 (Integrations)
                                               └─→ Phase 18 (Mobile)
                                                     └─→ Phase 19 (Security)
                                                           └─→ Phase 20 (Launch) 🚀`

---

## Team Scaling Recommendation

| Period | Team Size | Roles |
| --- | --- | --- |
| Phases 0–3 | 2–3 devs | 1 Backend Lead, 1 Frontend Lead, 1 Fullstack |
| Phases 4–8 | 3–4 devs | Add 1 Fullstack |
| Phases 9–14 | 4–6 devs | Add 1 Backend, 1 Frontend (feature teams) |
| Phases 15–16 | 5–7 devs | Add 1 ML/AI Engineer |
| Phases 17–20 | 5–7 devs | Add 1 DevOps/SRE, 1 QA Engineer |