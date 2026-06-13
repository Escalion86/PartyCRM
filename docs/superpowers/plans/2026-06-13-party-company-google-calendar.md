# PartyCRM Company Google Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить company-level OAuth Google Calendar и одностороннюю синхронизацию заказов PartyCRM с гибкими настройками из ArtistCRM.

**Architecture:** OAuth-токены и настройки принадлежат `PartyCompany`, а не пользователю. Отдельный PartyCRM sync engine строит payload из `PartyOrder`, использует инъецируемый Google client и вызывается после успешного сохранения заказа; ошибки календаря не откатывают CRUD. UI подключается к отдельным tenant-aware endpoints и остается изолированным от будущего performer-календаря.

**Tech Stack:** Next.js App Router, React 19, MongoDB/Mongoose, Google APIs, Node.js `node:test`, Tailwind CSS, Font Awesome.

---

## File Structure

- Create: `server/partyGoogleCalendarSettings.js` — defaults, нормализация, безопасный публичный status и OAuth credential merge.
- Create: `server/partyGoogleCalendarSettings.test.mjs` — unit-тесты settings и очистки токенов.
- Create: `server/partyGoogleCalendarOAuthState.js` — подписанный краткоживущий OAuth state.
- Create: `server/partyGoogleCalendarOAuthState.test.mjs` — tamper, expiry и redirect tests.
- Create: `server/partyGoogleCalendarClient.js` — OAuth2 client, calendar list и CRUD wrapper для компании.
- Create: `server/partyGoogleCalendarPayload.js` — чистое построение основного и дополнительного calendar payload.
- Create: `server/partyGoogleCalendarPayload.test.mjs` — title, finance, cancellation, dates и field toggles.
- Create: `server/partyGoogleCalendarSync.js` — lifecycle insert/update/recreate/delete и additional events diff.
- Create: `server/partyGoogleCalendarSync.test.mjs` — integration-style tests с fake Google client/models.
- Create: `app/api/party/google-calendar/status/route.js`
- Create: `app/api/party/google-calendar/auth-url/route.js`
- Create: `app/api/party/google-calendar/callback/route.js`
- Create: `app/api/party/google-calendar/calendars/route.js`
- Create: `app/api/party/google-calendar/select/route.js`
- Create: `app/api/party/google-calendar/settings/route.js`
- Create: `app/api/party/google-calendar/disconnect/route.js`
- Create: `app/api/party/google-calendar/sync-future/route.js`
- Create: `components/party/settings/PartyGoogleCalendarSettings.js` — UI управления company calendar.
- Modify: `schemas/partyOrdersSchema.js` — ids и sync diagnostics основного события.
- Modify: `app/api/party/company-settings/route.js` — запрет общего patch OAuth settings.
- Modify: `app/api/party/orders/route.js` — best-effort sync после create.
- Modify: `app/api/party/orders/[id]/route.js` — sync после status/full update и delete cleanup.
- Modify: `app/company/settings/content/companyIntegrationState.js` — состояние Google Calendar.
- Modify: `app/company/settings/content/companyIntegrationState.test.mjs` — Google indicator tests.
- Modify: `app/company/settings/content/CompanySettingsIntegrationsContent.js` — первая accordion-карточка Google Calendar.
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md` — закрытие Google Calendar блока после полной проверки.
- Modify: `docs/PARTYCRM_ROADMAP.md` — запись в журнале выполненного блока.
- Modify: `package.json`, `package-lock.json` — minor bump `1.3.2 -> 1.4.0` после закрытия эпика.

### Task 1: Company Calendar Settings Core

**Files:**
- Create: `server/partyGoogleCalendarSettings.js`
- Create: `server/partyGoogleCalendarSettings.test.mjs`
- Modify: `app/api/party/company-settings/route.js`

- [ ] **Step 1: Write failing normalization tests**

Проверить defaults для reminders, status colors, title mode и всех PartyCRM field toggles; trim calendar metadata; `enabled` только boolean; безопасный status не содержит `accessToken`/`refreshToken`; merge новых credentials сохраняет старый refresh token, если Google его не вернул.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test server/partyGoogleCalendarSettings.test.mjs
```

Expected: FAIL с `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement settings core**

Экспортировать:

```js
export const DEFAULT_PARTY_CALENDAR_REMINDERS = Object.freeze({ ... })
export const DEFAULT_PARTY_CALENDAR_STATUS_COLORS = Object.freeze({ ... })
export const DEFAULT_PARTY_CALENDAR_SYNC_SETTINGS = Object.freeze({ ... })
export const normalizePartyGoogleCalendarSettings = (value) => ({ ... })
export const toPublicPartyGoogleCalendarStatus = ({ settings, allowCalendarSync }) => ({ ... })
export const mergePartyGoogleCalendarCredentials = ({ previous, tokens, connectedEmail, userId, now }) => ({ ... })
```

`toPublic...` возвращает только connection state, email, calendar id/name, settings и diagnostics.

- [ ] **Step 4: Protect generic company settings patch**

В `company-settings/route.js` удалить `googleCalendar` из входного patch перед merge. OAuth-настройки меняются только специализированными endpoints.

- [ ] **Step 5: Verify GREEN and lint**

```powershell
node --test server/partyGoogleCalendarSettings.test.mjs
npx eslint server/partyGoogleCalendarSettings.js server/partyGoogleCalendarSettings.test.mjs app/api/party/company-settings/route.js
```

Expected: all pass.

### Task 2: Signed OAuth State

**Files:**
- Create: `server/partyGoogleCalendarOAuthState.js`
- Create: `server/partyGoogleCalendarOAuthState.test.mjs`

- [ ] **Step 1: Write failing security tests**

Проверить round-trip payload `{ companyId, userId, redirectPath, nonce, expiresAt }`, отклонение измененной подписи, истекшего state, внешнего redirect и отсутствующего secret.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyGoogleCalendarOAuthState.test.mjs
```

Expected: module missing.

- [ ] **Step 3: Implement HMAC state**

Использовать `crypto.createHmac('sha256', secret)`, base64url JSON и `timingSafeEqual`. Secret брать из `NEXTAUTH_SECRET`, fallback `LOGIN:PASSWORD` только для совместимости локальной среды. Разрешенный redirect: `/company/settings/integrations`.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test server/partyGoogleCalendarOAuthState.test.mjs
npx eslint server/partyGoogleCalendarOAuthState.js server/partyGoogleCalendarOAuthState.test.mjs
```

### Task 3: Party Company Google Client

**Files:**
- Create: `server/partyGoogleCalendarClient.js`
- Create: `server/partyGoogleCalendarClient.test.mjs`

- [ ] **Step 1: Write failing client tests**

Через инъекцию `oauthFactory`/`calendarFactory` проверить установку credentials, refresh callback, список календарей только с access role, insert/update/delete и классификацию `404`, `invalid_grant`.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyGoogleCalendarClient.test.mjs
```

- [ ] **Step 3: Implement client wrapper**

Экспортировать factory, которая принимает нормализованные company settings и возвращает:

```js
{ listCalendars, insertEvent, updateEvent, deleteEvent, getConnectedEmail }
```

Google env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`. Для Party callback использовать `${DOMAIN}/api/party/google-calendar/callback`, если redirect URI не задан явно для PartyCRM.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test server/partyGoogleCalendarClient.test.mjs
npx eslint server/partyGoogleCalendarClient.js server/partyGoogleCalendarClient.test.mjs
```

### Task 4: Order Schema And Calendar Payload

**Files:**
- Modify: `schemas/partyOrdersSchema.js`
- Create: `server/partyGoogleCalendarPayload.js`
- Create: `server/partyGoogleCalendarPayload.test.mjs`

- [ ] **Step 1: Write failing payload tests**

Покрыть:

- все title modes;
- status prefixes/colors;
- deposit/paid icons;
- client, address, services, staff, finances, transactions, payouts and links toggles;
- canceled reminders disabled;
- one-hour end fallback;
- `visibility: 'private'`;
- additional event 30-minute payload;
- plain-text sanitization.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyGoogleCalendarPayload.test.mjs
```

- [ ] **Step 3: Add schema fields**

```js
googleCalendarEventId: { type: String, default: '' },
googleCalendarCalendarId: { type: String, default: '' },
calendarSyncError: {
  type: String,
  enum: ['', 'calendar_sync_unavailable', 'calendar_sync_failed'],
  default: '',
},
calendarSyncedAt: { type: Date, default: null },
```

- [ ] **Step 4: Implement pure payload builders**

Экспортировать:

```js
export const buildPartyOrderCalendarPayload = ({ order, settings, company, transactions, location, services, staff, domain }) => ({ ... })
export const buildPartyAdditionalCalendarPayload = ({ item, orderContext, settings, company, domain }) => ({ ... })
export const calculatePartyOrderFinanceSummary = ({ order, transactions }) => ({ ... })
```

- [ ] **Step 5: Verify GREEN**

```powershell
node --test server/partyGoogleCalendarPayload.test.mjs
npx eslint schemas/partyOrdersSchema.js server/partyGoogleCalendarPayload.js server/partyGoogleCalendarPayload.test.mjs
```

### Task 5: Sync Engine

**Files:**
- Create: `server/partyGoogleCalendarSync.js`
- Create: `server/partyGoogleCalendarSync.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

Fake models/client должны доказать:

- unavailable context записывает `calendar_sync_unavailable` без Google call;
- insert сохраняет event/calendar ids и clears error;
- update использует существующий id;
- update 404 создает новое событие;
- смена calendar id создает новое событие;
- canceled delete mode удаляет main/additional events;
- canceled keep mode обновляет main event и удаляет additional events;
- removed/done/undated additional events удаляются;
- disabled `showAdditionalEvents` очищает связанные события;
- Google failure записывает `calendar_sync_failed` и не бросает наружу в best-effort mode.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyGoogleCalendarSync.test.mjs
```

- [ ] **Step 3: Implement sync service**

Основной экспорт:

```js
export const syncPartyOrderToCompanyCalendar = async ({
  company,
  order,
  previousOrder,
  access,
  dependencies,
}) => ({ ok, status, orderPatch })
```

`dependencies` содержит Google client, models, clock и payload builders для тестируемости. Логи только с company/order ids и error code.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test server/partyGoogleCalendarSync.test.mjs
npx eslint server/partyGoogleCalendarSync.js server/partyGoogleCalendarSync.test.mjs
```

### Task 6: OAuth And Settings API

**Files:**
- Create all routes under `app/api/party/google-calendar/` except `sync-future`.
- Create: `server/partyGoogleCalendarApiCore.js`
- Create: `server/partyGoogleCalendarApiCore.test.mjs`

- [ ] **Step 1: Write failing API core tests**

Проверить management membership, company isolation, tariff denial, state validation, refresh-token preservation, safe status, select/settings merge and disconnect cleanup.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyGoogleCalendarApiCore.test.mjs
```

- [ ] **Step 3: Implement shared API core and thin routes**

Обычные routes вызывают `getPartyRequestContext({ managementOnly: true })` и tariff helper. Callback декодирует state, загружает PartyUser membership для указанной company и повторно проверяет owner/admin и тариф перед token exchange/save.

- [ ] **Step 4: Add OAuth replay defense**

Nonce хранить в `httpOnly`, `sameSite=lax`, `secure` production cookie с company-specific именем; callback требует совпадения nonce и удаляет cookie на success/error.

- [ ] **Step 5: Verify APIs**

```powershell
node --test server/partyGoogleCalendarApiCore.test.mjs
npx eslint server/partyGoogleCalendarApiCore.js server/partyGoogleCalendarApiCore.test.mjs app/api/party/google-calendar
```

### Task 7: Batch Future Sync API

**Files:**
- Create: `server/partyGoogleCalendarBatch.js`
- Create: `server/partyGoogleCalendarBatch.test.mjs`
- Create: `app/api/party/google-calendar/sync-future/route.js`

- [ ] **Step 1: Write failing batch tests**

Проверить start-of-day filter, all statuses, stable `_id` cursor, limit max 20, per-order failure isolation, counts and idempotent repeat.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyGoogleCalendarBatch.test.mjs
```

- [ ] **Step 3: Implement batch core and route**

POST принимает `{ cursor }`, выбирает следующую порцию tenant orders и возвращает:

```js
{ processed, synced, failed, nextCursor, done, errors }
```

Ошибки содержат order id и безопасный code, без клиентских данных.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test server/partyGoogleCalendarBatch.test.mjs
npx eslint server/partyGoogleCalendarBatch.js server/partyGoogleCalendarBatch.test.mjs app/api/party/google-calendar/sync-future/route.js
```

### Task 8: Wire Order CRUD

**Files:**
- Modify: `app/api/party/orders/route.js`
- Modify: `app/api/party/orders/[id]/route.js`
- Create: `server/partyOrderCalendarHooks.js`
- Create: `server/partyOrderCalendarHooks.test.mjs`

- [ ] **Step 1: Write failing hook tests**

Проверить вызов sync после create, status-only patch и full patch; previous order передается update; Google failure не меняет успешный HTTP CRUD result; permanent delete performs best-effort cleanup.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/partyOrderCalendarHooks.test.mjs
```

- [ ] **Step 3: Implement hook wrapper**

Wrapper загружает company/access и вызывает sync engine после Mongo write. Routes остаются владельцами CRUD, hook — владельцем календарного side effect.

- [ ] **Step 4: Integrate every write path**

Обязательно покрыть POST, status-only PATCH, full PATCH, soft cancel DELETE и permanent DELETE.

- [ ] **Step 5: Verify GREEN and regression**

```powershell
node --test server/partyOrderCalendarHooks.test.mjs server/partyGoogleCalendarSync.test.mjs helpers/partyTariffAccess.test.mjs
npx eslint server/partyOrderCalendarHooks.js server/partyOrderCalendarHooks.test.mjs app/api/party/orders/route.js app/api/party/orders/[id]/route.js
```

### Task 9: Company Calendar UI

**Files:**
- Create: `components/party/settings/PartyGoogleCalendarSettings.js`
- Modify: `app/company/settings/content/companyIntegrationState.js`
- Modify: `app/company/settings/content/companyIntegrationState.test.mjs`
- Modify: `app/company/settings/content/CompanySettingsIntegrationsContent.js`

- [ ] **Step 1: Extend indicator tests first**

Google rules: loading; disconnected without OAuth; warning when locked/reconnect/no calendar/error; connected only when connected + calendarId + enabled.

- [ ] **Step 2: Verify RED**

```powershell
node --test app/company/settings/content/companyIntegrationState.test.mjs
```

- [ ] **Step 3: Implement Google state rule**

Добавить `type: 'googleCalendar'` без изменения остальных integration states.

- [ ] **Step 4: Build PartyGoogleCalendarSettings**

Перенести UX ArtistCRM, но использовать Party endpoints, PartyCRM Tailwind style и company header. Включить connect/reconnect/disconnect, calendar selection, enabled toggle, reminders, colors, sync field toggles, cancellation behavior, diagnostics and confirmed future sync progress loop.

- [ ] **Step 5: Add first accordion card**

Карточка `Google Calendar` идет перед API/Tilda, видна всегда, получает `locked={!access.allowCalendarSync}` и status indicator. Не вкладывать самостоятельную внешнюю карточку внутрь accordion.

- [ ] **Step 6: Verify UI lint/tests**

```powershell
node --test app/company/settings/content/companyIntegrationState.test.mjs
npx eslint components/party/settings/PartyGoogleCalendarSettings.js app/company/settings/content/companyIntegrationState.js app/company/settings/content/companyIntegrationState.test.mjs app/company/settings/content/CompanySettingsIntegrationsContent.js
```

### Task 10: Full Verification, Documentation And Version

**Files:**
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md`
- Modify: `docs/PARTYCRM_ROADMAP.md`
- Modify: `docs/ENV_VARIABLES.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Run all focused calendar tests**

```powershell
node --test server/partyGoogleCalendarSettings.test.mjs server/partyGoogleCalendarOAuthState.test.mjs server/partyGoogleCalendarClient.test.mjs server/partyGoogleCalendarPayload.test.mjs server/partyGoogleCalendarSync.test.mjs server/partyGoogleCalendarApiCore.test.mjs server/partyGoogleCalendarBatch.test.mjs server/partyOrderCalendarHooks.test.mjs app/company/settings/content/companyIntegrationState.test.mjs
```

Expected: 0 failures.

- [ ] **Step 2: Run affected PartyCRM regression tests**

```powershell
node --test app/company/settings/companySettingsTabs.test.mjs helpers/companySettings.test.mjs helpers/partyTariffAccess.test.mjs helpers/partyOrderTransactions.test.mjs helpers/partyPerformerOrders.test.mjs
```

- [ ] **Step 3: Run ESLint and production build**

Run focused ESLint for every changed JS/MJS file, then:

```powershell
npm run build
```

- [ ] **Step 4: Browser verification**

В авторизованной owner/admin session проверить desktop и 390px mobile: collapsed card, status colors, OAuth return, calendar selection, settings save, cancel behavior choice and future sync progress. Отдельно проверить tariff lock. Performer не должен получить доступ к company settings/API.

- [ ] **Step 5: Update docs and close roadmap block**

В completion plan отметить готовыми шесть пунктов Google Calendar, добавить запись в журнал PartyCRM roadmap и описать новые env/redirect URI в `docs/ENV_VARIABLES.md`.

- [ ] **Step 6: Minor version bump**

Так как закрывается крупный функциональный блок с новой ценностью:

```powershell
npm version minor --no-git-tag-version
```

Expected: `1.3.2 -> 1.4.0` in package files.

- [ ] **Step 7: Final diff and commit**

```powershell
git diff --check
git status --short
git add -- app/api/party/google-calendar components/party/settings/PartyGoogleCalendarSettings.js server/partyGoogleCalendar* server/partyOrderCalendarHooks* schemas/partyOrdersSchema.js app/api/party/orders app/api/party/company-settings/route.js app/company/settings/content docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md docs/PARTYCRM_ROADMAP.md docs/ENV_VARIABLES.md package.json package-lock.json
git commit -m "feat: add PartyCRM company calendar sync"
```
