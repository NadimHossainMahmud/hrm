# Phase 4 — Notification Engine & Workflow System: Testing Plan

This document describes how to verify that Phase 4 is working end-to-end.

## Prerequisites

- PostgreSQL running (e.g. `DATABASE_URL` in `apps/api/.env`)
- Redis running (for BullMQ queues and optional Socket.io; if Redis is down, API still runs but email worker won’t start)
- Optional: SMTP server for email (e.g. MailHog on port 1025 for local dev)

## 1. Database migration and seed

```bash
cd apps/api

# Apply Phase 4 migration (if not already applied)
npx prisma migrate deploy

# Or create a new migration and apply (interactive)
npx prisma migrate dev --name add_phase4_notifications_workflows

# Seed permissions (notifications.read, workflows.read, workflows.write) and role assignments
npx prisma db seed
```

## 2. Run automated tests

```bash
cd apps/api
npm test
```

**Expected:** All tests pass, including:

- **Notification service (unit):** `notify`, `listNotifications`, `markAsRead`, `markAllAsRead`
- **Workflow service (unit):** `createTemplate`, `listTemplates`, `listPendingApprovals`
- **Notifications API (integration):** Unauthenticated requests to `GET /v1/notifications`, `GET /v1/notifications/unread-count`, `POST /v1/notifications/mark-all-read` return **401**
- **Workflows API (integration):** Unauthenticated requests to `GET /v1/workflows/me/pending`, `GET /v1/workflows/templates`, `POST /v1/workflows/instances` return **401**

## 3. Manual / E2E verification

### 3.1 Start API and Web

```bash
# Terminal 1 — API (includes Socket.io and email worker if Redis is available)
cd apps/api && npm run dev

# Terminal 2 — Web
cd apps/web && npm run dev
```

### 3.2 Notifications

1. **Login** as a user that has `notifications.read` (e.g. admin, manager, or employee after seed).
2. **Notification bell (top bar)**  
   - Bell icon visible.  
   - Unread count badge appears when there are unread notifications.  
   - Click bell → dropdown shows recent notifications and “View all”.
3. **Notification center**  
   - Go to **Dashboard → Notifications** (or click “View all”).  
   - List of notifications loads.  
   - “Mark all as read” updates list and unread count.  
   - “Mark read” on a single item updates that item and unread count.
4. **Create a notification (API)**  
   - Use the workflow “create instance” or any code path that calls `notify()`.  
   - Confirm a new in-app notification appears and (if email is configured) an email is queued/sent.

### 3.3 Workflows and approval inbox

1. **Create a workflow template (API)**

   ```bash
   # Replace TOKEN with a valid JWT (e.g. from login response) and TENANT_ID, USER_ID accordingly.
   curl -X POST http://localhost:3001/v1/workflows/templates \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"Time Off Approval","triggerType":"time_off","steps":[{"order":1,"approverType":"user","approverId":"APPROVER_USER_ID"}]}'
   ```

2. **Create a workflow instance (API)**  
   - Call `POST /v1/workflows/instances` with `resourceType`, `firstApproverId`, and optional `templateId`, `resourceId`.  
   - This creates an instance and the first approval step; the approver should receive a notification.

3. **Approval inbox (UI)**  
   - Login as the **approver** user.  
   - Go to **Dashboard → Approvals** (“My Pending Approvals”).  
   - Pending item(s) appear.  
   - **Approve** or **Reject** with optional comments; the item disappears from the list and the initiator can receive a notification (workflow_approved / workflow_rejected).

### 3.4 Real-time notifications (Socket.io)

1. Open the web app in a browser and log in (so the client has an access token).
2. Connect a Socket.io client to `http://localhost:3001` with auth: `{ auth: { token: ACCESS_TOKEN } }` (or equivalent query).
3. Trigger a notification for that user (e.g. create a workflow instance with that user as approver).
4. Confirm the client receives a `notification` event with the new notification payload (bell count can be updated in real time if the frontend subscribes to this event).

## 4. API quick reference (Phase 4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/notifications` | List notifications (paginated), `?unread_only=true&limit=20&cursor=...` |
| GET | `/v1/notifications/unread-count` | Unread count for bell |
| PATCH | `/v1/notifications/:id/read` | Mark one as read |
| POST | `/v1/notifications/mark-all-read` | Mark all as read |
| GET | `/v1/notifications/preferences` | Get notification preferences |
| PATCH | `/v1/notifications/preferences` | Update preference (`eventType`, `inApp`, `email`) |
| GET | `/v1/workflows/templates` | List workflow templates |
| POST | `/v1/workflows/templates` | Create template |
| GET | `/v1/workflows/templates/:id` | Get template |
| PATCH | `/v1/workflows/templates/:id` | Update template |
| GET | `/v1/workflows/instances` | List instances (admin) |
| POST | `/v1/workflows/instances` | Create instance (`resourceType`, `firstApproverId`, optional `templateId`, `resourceId`) |
| POST | `/v1/workflows/instances/:id/approve` | Approve current step (body: `comments`, `nextApproverId`) |
| POST | `/v1/workflows/instances/:id/reject` | Reject current step (body: `comments`) |
| GET | `/v1/workflows/me/pending` | My pending approvals (approval inbox) |

## 5. Checklist summary

- [ ] Migration applied; seed run; permissions and roles include `notifications.read`, `workflows.read`, `workflows.write`.
- [ ] `npm test` passes in `apps/api`.
- [ ] Notification bell shows and unread count updates (after creating at least one notification).
- [ ] Notification center page lists notifications; mark one / mark all as read works.
- [ ] Workflow template can be created via API; workflow instance can be created with a first approver.
- [ ] Approval inbox shows pending items for the approver; approve/reject works and notifies initiator.
- [ ] (Optional) Socket.io connection with token and receiving `notification` events.
- [ ] (Optional) Email worker sends emails when Redis and SMTP are configured.
