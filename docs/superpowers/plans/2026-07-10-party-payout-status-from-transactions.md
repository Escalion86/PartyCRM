# Party Payout Status From Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести статус выплат исполнителей с ручного поля на расчёт по payout-транзакциям конкретного исполнителя.

**Architecture:** Добавить `staffId` в PartyCRM транзакции и общий helper расчёта статусов выплат по `assignedStaff` + `transactions`. API транзакций валидирует payout-транзакции относительно команды заказа, а UI показывает статус как read-only и требует выбор исполнителя только для категории `payout`.

**Tech Stack:** Next.js App Router, React, Mongoose, Node.js `node:test`, ESLint.

---

### Task 1: Payout Calculation Helpers

**Files:**
- Modify: `helpers/partyOrderTransactions.js`
- Modify: `helpers/partyOrderTransactions.test.mjs`
- Modify: `helpers/partyOrderCloseReadiness.js`
- Modify: `helpers/partyOrderFinanceFilters.js`
- Modify: `server/partyGoogleCalendarPayload.js`

- [ ] Add failing tests for derived payout statuses.
- [ ] Implement `getPartyOrderPayoutSummary()` and `getPartyAssignmentPayoutState()`.
- [ ] Replace manual `payoutStatus` checks in close readiness, finance filters and calendar summary.
- [ ] Run `node --test helpers/partyOrderTransactions.test.mjs helpers/partyOrderCloseReadiness.test.mjs helpers/partyOrderFinanceFilters.test.mjs server/partyGoogleCalendarPayload.test.mjs`.

### Task 2: Transaction Staff Link

**Files:**
- Modify: `schemas/partyTransactionsSchema.js`
- Modify: `server/partyTransactionsCore.js`
- Modify: `server/partyTransactions.test.mjs`
- Modify: `app/api/party/transactions/route.js`
- Modify: `app/api/party/transactions/[id]/route.js`
- Modify: `server/partyApiRoutes.test.mjs`

- [ ] Add failing tests for `staffId` normalization and route-level validation.
- [ ] Add optional `staffId` to the transaction schema.
- [ ] Normalize and serialize `staffId`.
- [ ] Require a valid assigned staff member for `expense + payout` transactions.
- [ ] Clear `staffId` for non-payout transactions.
- [ ] Run `node --test server/partyTransactions.test.mjs server/partyApiRoutes.test.mjs`.

### Task 3: Order UI

**Files:**
- Modify: `components/party/modals/OrderModal.js`
- Modify: `components/party/orders/PartyOrderTransactionsSection.js`
- Modify: `helpers/partyOrderViewModalUi.test.mjs`
- Modify: `helpers/partyOrderTransactions.test.mjs`

- [ ] Add source tests that the manual payout status select is gone and payout transactions expose performer selection.
- [ ] Pass assigned staff and staff dictionary into `PartyOrderTransactionsSection`.
- [ ] Show read-only payout status in the team tab.
- [ ] Show performer select only for payout expense transactions.
- [ ] Run targeted tests and ESLint on changed JS files.
