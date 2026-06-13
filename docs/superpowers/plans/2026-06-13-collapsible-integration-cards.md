# Collapsible Integration Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать карточки интеграций PartyCRM свернутыми по умолчанию и постоянно показывать компактный цветной индикатор фактического состояния подключения.

**Architecture:** Вынести вычисление визуального состояния интеграций в чистый helper с Node-тестами. Существующий `CompanyIntegrationCard` превратить в независимый доступный accordion без изменения API, форм и действий подключения. Интерактивность раскрытия проверить в локальном браузере, поскольку в проекте нет настроенного DOM test runner.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS, Font Awesome, Node.js built-in test runner, ESLint.

---

## File Structure

- Create: `app/company/settings/content/companyIntegrationState.js` — чистые правила `connected`, `warning`, `disconnected`, `loading` для каждой карточки.
- Create: `app/company/settings/content/companyIntegrationState.test.mjs` — unit-тесты правил индикаторов через `node:test`.
- Modify: `app/company/settings/content/CompanySettingsIntegrationsContent.js` — accordion-разметка, индикатор, вычисление состояний и передача props карточкам.
- Modify: `docs/superpowers/specs/2026-06-13-collapsible-integration-cards-design.md` — фактическое правило Novofon согласно существующему status endpoint.

### Task 1: Pure Integration Indicator State

**Files:**
- Create: `app/company/settings/content/companyIntegrationState.js`
- Create: `app/company/settings/content/companyIntegrationState.test.mjs`

- [ ] **Step 1: Write failing state tests**

Создать тесты для экспортов `INTEGRATION_INDICATOR_STATE` и `getCompanyIntegrationIndicatorState`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INTEGRATION_INDICATOR_STATE,
  getCompanyIntegrationIndicatorState,
} from './companyIntegrationState.js'

test('returns loading before provider status is loaded', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'avito', loading: true }),
    INTEGRATION_INDICATOR_STATE.loading
  )
})

test('marks public lead API connected only with enabled active key', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [{ key: 'secret', enabled: true }],
    }),
    INTEGRATION_INDICATOR_STATE.connected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [{ key: 'secret', enabled: false }],
    }),
    INTEGRATION_INDICATOR_STATE.warning
  )
})

test('uses connected provider status for Avito and VK', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'avito',
      enabled: true,
      status: 'connected',
    }),
    INTEGRATION_INDICATOR_STATE.connected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'vk',
      enabled: true,
      status: 'auth_error',
    }),
    INTEGRATION_INDICATOR_STATE.warning
  )
})

test('uses enabled and api key for Novofon connection', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'novofon',
      enabled: true,
      apiKey: 'key',
    }),
    INTEGRATION_INDICATOR_STATE.connected
  )
})

test('uses AITunnel key for AI connection', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'ai', apiKey: ' key ' }),
    INTEGRATION_INDICATOR_STATE.connected
  )
})

test('locked integrations have warning priority', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'ai',
      apiKey: 'key',
      locked: true,
    }),
    INTEGRATION_INDICATOR_STATE.warning
  )
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test app/company/settings/content/companyIntegrationState.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `companyIntegrationState.js`.

- [ ] **Step 3: Implement minimal state helper**

Create constants and one pure function:

```js
export const INTEGRATION_INDICATOR_STATE = Object.freeze({
  connected: 'connected',
  disconnected: 'disconnected',
  warning: 'warning',
  loading: 'loading',
})

export const getCompanyIntegrationIndicatorState = ({
  type,
  enabled = false,
  status = '',
  apiKey = '',
  apiKeys = [],
  locked = false,
  loading = false,
}) => {
  if (locked) return INTEGRATION_INDICATOR_STATE.warning
  if (loading) return INTEGRATION_INDICATOR_STATE.loading

  if (type === 'publicLead') {
    const hasActiveKey = apiKeys.some(
      (item) => item?.enabled !== false && String(item?.key || '').trim()
    )
    if (enabled && hasActiveKey) return INTEGRATION_INDICATOR_STATE.connected
    if (enabled) return INTEGRATION_INDICATOR_STATE.warning
    return INTEGRATION_INDICATOR_STATE.disconnected
  }

  if (type === 'avito' || type === 'vk') {
    if (status === 'connected') return INTEGRATION_INDICATOR_STATE.connected
    if (enabled) return INTEGRATION_INDICATOR_STATE.warning
    return INTEGRATION_INDICATOR_STATE.disconnected
  }

  if (type === 'novofon') {
    if (enabled && String(apiKey).trim()) {
      return INTEGRATION_INDICATOR_STATE.connected
    }
    if (enabled) return INTEGRATION_INDICATOR_STATE.warning
    return INTEGRATION_INDICATOR_STATE.disconnected
  }

  if (type === 'ai') {
    return String(apiKey).trim()
      ? INTEGRATION_INDICATOR_STATE.connected
      : INTEGRATION_INDICATOR_STATE.disconnected
  }

  return INTEGRATION_INDICATOR_STATE.disconnected
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test app/company/settings/content/companyIntegrationState.test.mjs
```

Expected: 6 tests pass, 0 fail.

### Task 2: Accessible Collapsible Card

**Files:**
- Modify: `app/company/settings/content/CompanySettingsIntegrationsContent.js`

- [ ] **Step 1: Add imports and indicator presentation map**

Import `useId`, Font Awesome chevron icon, and the pure state helper. Define a local map where each state has PartyCRM Tailwind classes and accessible Russian text:

```js
const INTEGRATION_INDICATOR_VIEW = {
  connected: {
    className: 'bg-emerald-500 ring-4 ring-emerald-100',
    label: 'Интеграция подключена',
  },
  disconnected: {
    className: 'bg-slate-300 ring-4 ring-slate-100',
    label: 'Интеграция не подключена',
  },
  warning: {
    className: 'bg-amber-400 ring-4 ring-amber-100',
    label: 'Интеграция требует внимания',
  },
  loading: {
    className: 'animate-pulse bg-slate-300 ring-4 ring-slate-100',
    label: 'Проверяем состояние интеграции',
  },
}
```

- [ ] **Step 2: Convert `CompanyIntegrationCard` to local accordion**

Add `indicatorState`, local `open = false`, and `useId()`. Render a full-width button with `aria-expanded`, `aria-controls`, indicator dot, title, description, and rotating `faChevronDown`. Render the existing locked message, note, and children only when `open` is true. Preserve `pointer-events-none` for locked content and existing PartyCRM colors.

- [ ] **Step 3: Compute card states once in page component**

After `integrations`, derive:

```js
const publicLeadIndicatorState = getCompanyIntegrationIndicatorState({
  type: 'publicLead',
  enabled: settings?.publicLeadEnabled === true,
  apiKeys: settings?.publicLeadApiKeys ?? [],
})

const avitoIndicatorState = getCompanyIntegrationIndicatorState({
  type: 'avito',
  enabled: integrations.avitoEnabled === true,
  status: status?.avito?.status,
  loading: statusLoading,
})
```

Repeat with `vk`, `novofon`, and `ai`, passing tariff locks for Novofon and AI. For Novofon use `status?.novofon?.enabled` and `status?.novofon?.apiKey`, with local settings as fallback. For AI use `status?.ai?.aitunnelKey`, with local settings as fallback.

- [ ] **Step 4: Pass state to all five cards**

Add `indicatorState={...}` to `Входящие заявки API / Tilda`, `Avito`, `VK`, `Novofon`, and `AITunnel / AI`. Do not change existing children, form handlers, or API calls.

- [ ] **Step 5: Run helper tests and ESLint**

Run:

```powershell
node --test app/company/settings/content/companyIntegrationState.test.mjs
npx eslint app/company/settings/content/CompanySettingsIntegrationsContent.js app/company/settings/content/companyIntegrationState.js app/company/settings/content/companyIntegrationState.test.mjs
```

Expected: all tests pass and ESLint exits 0.

### Task 3: Browser Verification And Regression Check

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run existing company settings tests**

Run:

```powershell
node --test app/company/settings/companySettingsTabs.test.mjs helpers/companySettings.test.mjs app/company/settings/content/companyIntegrationState.test.mjs
```

Expected: all tests pass, 0 fail.

- [ ] **Step 2: Start or reuse local PartyCRM**

Run `npm run dev` only if no PartyCRM dev server is active. Open the company integrations route for an authenticated management membership.

- [ ] **Step 3: Verify desktop behavior in Browser**

Confirm:

- all five cards are collapsed on first render;
- each header shows its indicator and chevron;
- clicking one card opens only that card;
- clicking it again closes it;
- opening a second card does not close the first;
- `aria-expanded` changes between `false` and `true`;
- fields and action buttons retain their existing behavior.

- [ ] **Step 4: Verify mobile layout in Browser**

Set a narrow viewport around 390px. Confirm title and description wrap without overlapping the fixed-size indicator and chevron, headers remain easy to tap, and existing fields remain within the viewport.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git diff --check
git diff -- app/company/settings/content/CompanySettingsIntegrationsContent.js app/company/settings/content/companyIntegrationState.js app/company/settings/content/companyIntegrationState.test.mjs docs/superpowers/specs/2026-06-13-collapsible-integration-cards-design.md
```

Expected: no whitespace errors; diff contains only the accordion, indicator helper/tests, and Novofon specification correction.

- [ ] **Step 6: Commit implementation**

```powershell
git add -- app/company/settings/content/CompanySettingsIntegrationsContent.js app/company/settings/content/companyIntegrationState.js app/company/settings/content/companyIntegrationState.test.mjs docs/superpowers/specs/2026-06-13-collapsible-integration-cards-design.md docs/superpowers/plans/2026-06-13-collapsible-integration-cards.md
git commit -m "feat: collapse PartyCRM integration cards"
```
