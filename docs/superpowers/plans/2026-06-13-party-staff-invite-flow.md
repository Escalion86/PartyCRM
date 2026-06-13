# PartyCRM Staff Invite Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать безопасные одноразовые ссылки приглашения сотрудников с регистрацией/входом и автоматической membership-привязкой к компании в роли admin или performer.

**Architecture:** Чистый helper отвечает за токены, статусы и решения принятия; Mongo-модель хранит только хеш и аудит. Management API работает в tenant context, публичный API раскрывает минимальный view model, а принятие выполняет условные обновления invite/staff/user. UI переиспользует существующий auth callback flow.

**Tech Stack:** Next.js App Router, React 19, MongoDB/Mongoose, Node crypto, Node test runner, Tailwind CSS.

---

### Task 1: Invite domain helper

**Files:**
- Create: `helpers/partyStaffInvites.js`
- Create: `helpers/partyStaffInvites.test.mjs`

- [ ] Написать падающие тесты генерации токена/хеша, expiry, публичного view model и решения принятия.
- [ ] Запустить `node --test helpers/partyStaffInvites.test.mjs` и подтвердить RED.
- [ ] Реализовать минимальные чистые функции и получить PASS.

### Task 2: Mongo model

**Files:**
- Create: `schemas/partyStaffInvitesSchema.js`
- Modify: `server/partyModels.js`

- [ ] Добавить поля из спецификации и индексы `tokenHash unique`, `tenantId + staffId + status`, TTL-compatible `expiresAt` без автоматического удаления аудита.
- [ ] Экспортировать `getPartyStaffInviteModel`.

### Task 3: Management API

**Files:**
- Create: `app/api/party/staff/[id]/invite/route.js`

- [ ] Реализовать GET статуса.
- [ ] Реализовать POST выпуска: validate staff, role/phone, revoke previous, create invite, update staff invited state, вернуть URL один раз.
- [ ] Реализовать DELETE отмены.

### Task 4: Public invite API

**Files:**
- Create: `app/api/party/invites/[token]/route.js`
- Create: `app/api/party/invites/[token]/accept/route.js`

- [ ] GET возвращает безопасные данные и актуализирует expired status.
- [ ] POST проверяет session phone, membership conflict и staff binding.
- [ ] Условно обновить invite, staff и PartyUser interfaceRoles; вернуть redirect target.

### Task 5: Staff management UI

**Files:**
- Modify: `components/party/lists/StaffList.js`
- Modify: `app/company/CompanyWorkspaceClient.js`
- Create: `components/party/staff/PartyStaffInvitePanel.js`

- [ ] Добавить кнопку `Пригласить в систему` для непривязанной карточки.
- [ ] Добавить создание, копирование, перевыпуск и отмену ссылки.
- [ ] Отображать status/expiresAt без сохранения открытого токена после перезагрузки.

### Task 6: Invite landing and auth return

**Files:**
- Create: `app/party/invite/[token]/page.js`
- Create: `app/party/invite/[token]/PartyStaffInviteClient.js`
- Modify: `app/party/login/PartyLoginClient.js`

- [ ] Показать компанию, сотрудника, роль и статусы ошибки.
- [ ] Для гостя дать вход/регистрацию с callback на текущий invite URL.
- [ ] После авторизации показать совпадение телефона и кнопку принятия.
- [ ] После успеха перейти в company/performer workspace.

### Task 7: Docs/version/verification

**Files:**
- Modify: `docs/PARTYCRM_ROADMAP.md`
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md`
- Modify: `docs/PARTYCRM_ROLES.md`
- Modify: `package.json`, `package-lock.json`

- [ ] Закрыть PC-INV1..PC-INV4 и описать сценарий.
- [ ] Выполнить minor bump из-за новой функции.
- [ ] Запустить unit-тесты, eslint, `npm run build` и Browser QA при доступности.
