# PartyCRM Billing Hardening And Tochka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden PartyCRM YooKassa billing and add Tochka payment endpoints for PartyCRM tariff/balance payments.

**Architecture:** Keep PartyCRM billing on `PartyCompany`. Users only initiate payments as company owner/admin. Reuse existing provider helpers (`server/yookassa.js`, `server/tochka.js`) and add Party-specific processing that uses `getPartyPaymentModel()`, `getPartyCompanyModel()` and `applyPartyCompanyTariffPurchase()`.

**Tech Stack:** Next.js App Router API routes, MongoDB/Mongoose product models, YooKassa, Tochka JWT webhook verification.

---

### Task 1: Harden PartyCRM YooKassa

**Files:**
- Modify: `app/api/party/billing/yookassa/create/route.js`
- Modify: `app/api/party/billing/yookassa/webhook/route.js`
- Modify: `server/partyYookassaPaymentProcessing.js`

- [x] Make tariff payment amount use `tariff.price`.
- [x] Reject production YooKassa webhook when `YOOKASSA_WEBHOOK_SECRET` is missing.
- [x] Add pending-lock before successful payment balance accrual.

### Task 2: Add PartyCRM Tochka Processing

**Files:**
- Create: `server/partyTochkaPaymentProcessing.js`

- [x] Verify Tochka JWT through public JWK.
- [x] Sync PartyCRM payment by `providerPaymentId` or `paymentId`.
- [x] Apply pending-lock before balance accrual.
- [x] Activate PartyCRM tariff through `applyPartyTariffPurchase()`.

### Task 3: Add PartyCRM Tochka API Routes

**Files:**
- Create: `app/api/party/billing/tochka/create/route.js`
- Create: `app/api/party/billing/tochka/sync/route.js`
- Create: `app/api/party/billing/tochka/webhook/route.js`

- [x] Create Tochka payment for balance or tariff.
- [x] Sync only owner/support/admin payment.
- [x] Accept signed Tochka webhook and ignore non-PartyCRM payments.

### Task 4: Docs And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ENV_VARIABLES.md`
- Modify: `.env.example`
- Modify: `.env.deploy.example`
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md`
- Modify: `app/api/party/billing/config/route.js`
- Modify: `components/party/PartyBillingModal.js`
- Create: `app/api/party/billing/tariff/select/route.js`
- Create: `helpers/partyBillingCheckout.js`
- Create: `helpers/partyBillingCheckout.test.mjs`

- [x] Document Tochka env and webhook URL.
- [x] Mark billing code hardening as done in launch plan.
- [x] Expose configured providers in PartyCRM billing config.
- [x] Add provider selection to PartyCRM billing modal for balance and tariff payments.
- [x] Route free tariff selection through direct tariff select endpoint without payment provider.
- [x] Move PartyCRM tariff, balance, renewal and payment history ownership from PartyUser to PartyCompany.
- [x] Run targeted eslint.
- [x] Run existing tests.
- [x] Run production build.
