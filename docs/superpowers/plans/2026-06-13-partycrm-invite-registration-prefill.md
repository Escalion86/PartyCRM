# PartyCRM Invite Registration Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создавать приглашение одним кликом, использовать `DOMAIN` и заполнять регистрацию данными приглашённого сотрудника.

**Architecture:** Расширить чистые helpers приглашений для URL и prefill, использовать их в API, затем связать UI приглашения и регистрации только через bearer-токен. Существующие API принятия приглашения и подтверждения телефона не менять.

**Tech Stack:** Next.js 16 App Router, React 19, Node test runner, ESLint.

---

### Task 1: Invite URL And Public Prefill

**Files:**
- Modify: `helpers/partyStaffInvites.js`
- Modify: `helpers/partyStaffInvites.test.mjs`
- Modify: `app/api/party/staff/[id]/invite/route.js`

- [x] Добавить failing-тесты для URL от `DOMAIN` и полей `firstName`, `secondName`, `phone`, `registrationRole`.
- [x] Запустить `node --test helpers/partyStaffInvites.test.mjs` и подтвердить ожидаемое падение.
- [x] Реализовать `buildPartyStaffInviteUrl()` и расширить активный public view регистрационными полями.
- [x] Перевести POST API на `process.env.DOMAIN` с fallback на request origin.
- [x] Повторно запустить тесты и получить PASS.

### Task 2: One-click Invite Creation

**Files:**
- Modify: `components/party/staff/PartyStaffInvitePanel.js`
- Create: `components/party/staff/PartyStaffInvitePanel.test.mjs`

- [x] Добавить failing статический тест: обработчик первого клика должен вызывать POST, а отдельная кнопка «Создать ссылку на 7 дней» должна отсутствовать.
- [x] Обновить обработчик: при закрытой панели сразу открыть её и создать приглашение; для уже загруженного приглашения только переключать видимость.
- [x] Оставить «Перевыпустить» и «Отменить» для активной ссылки.
- [x] Запустить тест и получить PASS.

### Task 3: Registration Prefill By Token

**Files:**
- Modify: `app/party/invite/[token]/PartyStaffInviteClient.js`
- Modify: `app/party/login/page.js`
- Modify: `app/party/login/PartyLoginClient.js`
- Create: `app/party/login/partyInviteRegistration.test.mjs`

- [x] Добавить failing статический тест на `inviteToken`, API-загрузку prefill и роль `performer`/`company`.
- [x] Передать токен в регистрационную ссылку и server page props.
- [x] При регистрации загрузить приглашение, заполнить телефон, имя, фамилию и режим роли.
- [x] Не обходить подтверждение телефона и не доверять полям query string.
- [x] Запустить тест и получить PASS.

### Task 4: Verification

**Files:**
- Verify all modified JavaScript and tests.

- [x] Запустить все PartyCRM unit-тесты.
- [x] Запустить ESLint по изменённым JS/MJS.
- [x] Запустить `npm run build`.
- [x] Запустить `git diff --check` и просмотреть итоговый diff.
