# Party Performer Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send PartyCRM push notifications to performers for new assignments, assignment changes, and account-link requests without exposing company financial data.

**Architecture:** Reuse the existing PartyCRM push subscription model and add a user-targeted filter to the push sender. Keep notification payload construction in `server/partyPushCore.js`, then call it from order create/update routes and staff link-request route.

**Tech Stack:** Next.js App Router API routes, Mongoose models, Web Push via existing `server/pushNotifications.js`, Node test runner, ESLint.

---

### Task 1: Push Payload Helpers

**Files:**
- Modify: `server/partyPushCore.test.mjs`
- Modify: `server/partyPushCore.js`

- [x] **Step 1: Write failing tests**

Add tests for:
- `buildPartyPerformerAssignmentPushPayload` with type `party_performer_assignment_new`.
- `buildPartyPerformerAssignmentPushPayload` with type `party_performer_assignment_changed`.
- `buildPartyPerformerLinkRequestPushPayload`.
- Payloads must include company/order/staff ids and `/performer`, but not `contractAmount`, `clientPayment`, or `transactions`.

- [x] **Step 2: Run RED**

Run: `node --test server/partyPushCore.test.mjs`

Expected: fail because the new helpers are not exported.

- [x] **Step 3: Implement helpers**

Add minimal payload builders in `server/partyPushCore.js`.

- [x] **Step 4: Run GREEN**

Run: `node --test server/partyPushCore.test.mjs`

Expected: pass.

### Task 2: User-Targeted Push Sending

**Files:**
- Modify: `server/pushNotifications.js`

- [x] **Step 1: Write failing test coverage where possible through route/helper behavior**

Verify route integration can pass `targetUserId` to `sendPushToTenant`.

- [x] **Step 2: Implement target filter**

Extend `sendPushToTenant` with optional `targetUserId`; when present, query active subscriptions by `tenantId` and `userId`.

- [x] **Step 3: Preserve existing tenant-wide behavior**

Calls without `targetUserId` must keep sending to all active subscriptions for the tenant.

### Task 3: Route Integration

**Files:**
- Modify: `app/api/party/orders/route.js`
- Modify: `app/api/party/orders/[id]/route.js`
- Modify: `app/api/party/staff/[id]/link-request/route.js`

- [x] **Step 1: Add assignment notification helpers**

After order creation, notify assigned staff with linked account ids.

- [x] **Step 2: Add assignment-change notifications**

After order update, notify linked staff when they are newly assigned or when event date, end date, place, address, service, title, or assignment status fields changed.

- [x] **Step 3: Add link-request notification**

After manual link-request creation, notify the matched Party user.

- [x] **Step 4: Keep push best-effort**

Push failures must be logged with non-sensitive metadata and must not fail order/staff API responses.

### Task 4: Docs, Version, Verification

**Files:**
- Modify: `docs/PARTYCRM_ROADMAP.md`
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md`
- Modify: `package.json`

- [x] **Step 1: Mark performer push done**

Update the launch-plan checkbox and add a roadmap journal entry dated 2026-06-21.

- [x] **Step 2: Patch-bump version**

Update app version from `1.4.7` to `1.4.8`.

- [x] **Step 3: Run focused verification**

Run:

```powershell
node --test server/partyPushCore.test.mjs
npx eslint server/partyPushCore.js server/pushNotifications.js app/api/party/orders/route.js app/api/party/orders/[id]/route.js app/api/party/staff/[id]/link-request/route.js server/partyPushCore.test.mjs
```
