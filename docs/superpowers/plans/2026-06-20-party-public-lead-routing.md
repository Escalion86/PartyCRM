# Party Public Lead Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route PartyCRM public leads to the right company location and service by explicit payload fields or simple company settings rules.

**Architecture:** Keep routing as pure helper logic in `server/partyPublicLeadCore.js`, then let `server/partyPublicLeadService.js` load active company locations/services and pass resolved routing into order payload construction. Existing `/api/party/public/lead` and `/api/party/public/lead/tilda` stay thin and reuse the same service.

**Tech Stack:** Next.js App Router API routes, Node test runner, Mongoose models through `server/partyModels`.

---

### Task 1: Core Routing Tests

**Files:**
- Modify: `server/partyPublicLeadCore.test.mjs`

- [x] **Step 1: Write failing tests for payload and routing resolution**

Add imports for `resolvePartyPublicLeadRouting` and tests covering explicit payload fields, source rules, and fallback.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --test server/partyPublicLeadCore.test.mjs`

Expected: fail because `resolvePartyPublicLeadRouting` is not exported.

### Task 2: Core Routing Implementation

**Files:**
- Modify: `server/partyPublicLeadCore.js`
- Modify: `server/partyPublicLeadCore.test.mjs`

- [x] **Step 1: Extend normalized public lead payload**

Add `locationId`, `locationTitle`, and `serviceId` to `normalizePartyPublicLeadPayload`.

- [x] **Step 2: Implement `resolvePartyPublicLeadRouting`**

The helper accepts `{ normalized, settings, locations, services }` and returns `{ locationId, servicesIds, serviceTitle, placeType, routing }`.

- [x] **Step 3: Update `buildPartyPublicLeadOrderPayload`**

Accept `routing` and use it for `locationId`, `servicesIds`, `serviceTitle`, `placeType`, and `leadMeta.routing`.

- [x] **Step 4: Run core tests and confirm GREEN**

Run: `node --test server/partyPublicLeadCore.test.mjs`

Expected: pass.

### Task 3: Service Integration

**Files:**
- Modify: `server/partyPublicLeadService.js`

- [x] **Step 1: Load active locations and services**

Use `getPartyLocationModel()` and `getPartyServiceModel()` in `createPartyPublicLeadOrder`.

- [x] **Step 2: Resolve routing before payload creation**

Call `resolvePartyPublicLeadRouting` with company settings, active locations and active services.

- [x] **Step 3: Pass routing to order payload builder**

Keep API routes unchanged because they already use `createPartyPublicLeadOrder`.

### Task 4: Settings Normalization

**Files:**
- Modify: `helpers/companySettings.js`
- Modify: `helpers/companySettings.test.mjs`

- [x] **Step 1: Add `publicLeadRoutingRules` default and normalizer**

Normalize ids/titles/source/enabled and drop empty rules.

- [x] **Step 2: Add unit test for routing rule normalization**

Run: `node --test helpers/companySettings.test.mjs`

Expected: pass.

### Task 5: Docs, Roadmap, Version, Verification

**Files:**
- Modify: `docs/PARTYCRM_ROADMAP.md`
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md`
- Modify: `package.json`

- [x] **Step 1: Mark PC-LI3 and matching launch-plan item done**

Add a journal entry dated 2026-06-20.

- [x] **Step 2: Patch-bump version**

Update `package.json` from `1.4.2` to `1.4.3`.

- [x] **Step 3: Run focused verification**

Run:

```powershell
node --test server/partyPublicLeadCore.test.mjs helpers/companySettings.test.mjs
npx eslint server/partyPublicLeadCore.js server/partyPublicLeadService.js server/partyPublicLeadCore.test.mjs helpers/companySettings.js helpers/companySettings.test.mjs
```
