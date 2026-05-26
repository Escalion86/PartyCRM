# Company Settings Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести модуль `Настройки компании` в `PartyCRM` от рабочего MVP до завершённого company-level решения, закрыв хвосты по интеграциям, документам, уведомлениям, правам доступа и документации.

**Architecture:** Базовый модуль `app/company/settings/*` уже существует и остаётся основной точкой входа. Остаточные работы нужно вести поверх текущей архитектуры: не возвращать настройки в `CompanyWorkspaceClient`, не смешивать company settings с `/party/settings`, а доводить только отсутствующий backend, совместимость и регрессии внутри выделенного модуля.

**Tech Stack:** Next.js App Router, React Client Components, existing `apiJson`, party auth/context helpers, company settings API, Node `node:test`, targeted ESLint, existing party integrations server helpers.

---

## Current State Snapshot

Перед выполнением задач считать текущий статус таким:

- уже есть рабочая ветка `app/company/settings/*`;
- уже есть раскрывающийся пункт `Настройки компании` в [PartyAppShell.js](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/components/party/PartyAppShell.js);
- уже есть 6 вкладок и общий `companySettings` helper/API;
- `Общие` и `Списки` считаются реализованными;
- `Интеграции`, `Документы`, `Уведомления`, `Тарифы` реализованы на уровне MVP, но не все backend-сценарии доведены;
- ограничения вкладок по глобальной роли `PartyUser.role` уже введены.

Этот план покрывает только то, что осталось.

## Related Plan Package

Следующие документы уже созданы и должны идти как отдельный следующий пакет работ после этого плана:

- [2026-05-27-party-order-transactions-design.md](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/docs/superpowers/specs/2026-05-27-party-order-transactions-design.md)
- [2026-05-27-party-order-transactions.md](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/docs/superpowers/plans/2026-05-27-party-order-transactions.md)

Их не нужно переписывать в этом плане. Их нужно сохранить как независимый handoff-пакет для следующего этапа.

---

### Task 1: Привести сам план `company settings` к фактическому статусу

**Files:**
- Modify: `docs/superpowers/plans/2026-05-27-company-settings.md`
- Modify: `docs/superpowers/specs/2026-05-27-company-settings-design.md`
- Reference: `app/company/settings/*`

- [ ] **Step 1: Обновить implementation plan, чтобы он отражал факт частичного выполнения**

В [2026-05-27-company-settings.md](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/docs/superpowers/plans/2026-05-27-company-settings.md):

- не переписывать весь документ заново;
- добавить сверху короткий статус-блок:

```md
## Status Snapshot

- Done: routing, sidebar entry, settings API normalization, tabs `Общие` / `Списки`
- MVP Done: `Интеграции`, `Уведомления`, `Документы`, `Тарифы`
- Remaining: full company-level integrations backend, deeper documents flow, notification backend parity, final browser regression pass
```

- [ ] **Step 2: Пометить в design/spec, что архитектурная часть уже реализована**

В [2026-05-27-company-settings-design.md](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/docs/superpowers/specs/2026-05-27-company-settings-design.md):

- добавить краткую секцию `Фактический статус на 2026-05-27`, где перечислить:
  - отдельная ветка роутов уже существует;
  - sidebar и подменю уже работают;
  - company settings API и helper уже используются;
  - дальнейшая работа сфокусирована на хвостах, а не на скелете.

- [ ] **Step 3: Прогнать точечный lint markdown не требуется, но проверить ссылки и имена файлов вручную**

Проверить:

- что все упомянутые пути реальны;
- что не осталось устаревших утверждений вроде “будет создано”, если файл уже создан.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-27-company-settings.md docs/superpowers/specs/2026-05-27-company-settings-design.md
git commit -m "docs: update company settings status snapshot"
```

---

### Task 2: Довести вкладку `Интеграции` до полноценного company-level backend

**Files:**
- Modify: `app/company/settings/content/CompanySettingsIntegrationsContent.js`
- Modify: `app/api/party/integrations/status/route.js`
- Create: `app/api/party/integrations/avito/connect/route.js`
- Create: `app/api/party/integrations/avito/check/route.js`
- Create: `app/api/party/integrations/avito/disconnect/route.js`
- Create: `app/api/party/integrations/vk/connect/route.js`
- Create: `app/api/party/integrations/vk/check/route.js`
- Create: `app/api/party/integrations/vk/disconnect/route.js`
- Create: `app/api/party/integrations/novofon/connect/route.js`
- Create: `app/api/party/integrations/novofon/disconnect/route.js`
- Create: `app/api/party/integrations/ai/save/route.js`
- Modify: `server/avito.js`
- Modify: `server/vkGroup.js`
- Modify: `server/novofon.js`
- Modify: `server/aiSettings.js`

- [ ] **Step 1: Зафиксировать текущий shape `settings.integrations` как канонический**

В одном месте, рядом с UI или helper-слоем, задокументировать текущую структуру:

```js
{
  integrations: {
    avito: { enabled, clientId, clientSecret, userId, webhookUrl, webhookSecret },
    vk: { enabled, groupId, accessToken, confirmCode, secretKey },
    novofon: { enabled, apiKey, virtualPhone, webhookKey },
    ai: { enabled, openaiApiKey, model, promptMode }
  }
}
```

Цель: не допустить новых хаотичных ключей.

- [ ] **Step 2: Реализовать party-level `connect/check/disconnect` для Avito**

Каждый route обязан:

- использовать `getPartyRequestContext({ req, managementOnly: true })`;
- читать/писать только `PartyCompanies.settings.integrations`;
- не использовать legacy `siteSettings` как место записи;
- возвращать единый `{ success, data }` или `{ success: false, error }`.

- [ ] **Step 3: Реализовать party-level `connect/check/disconnect` для VK**

Логика та же:

- company-scoped storage;
- company-scoped webhook/check сценарии;
- никакой записи в старые user/site-level settings.

- [ ] **Step 4: Реализовать party-level сохранение/отключение Novofon и AI**

Для `Novofon` и `AI` минимальный необходимый результат:

- форма в UI сохраняет данные в company storage;
- status endpoint читает именно company storage;
- disconnect/disable тоже очищает company storage.

- [ ] **Step 5: Убрать из UI пометку про legacy backend там, где backend уже доведён**

В `CompanySettingsIntegrationsContent.js` удалить предупреждения вида:

```js
note="... backend-маршрутизация будет переведена отдельным шагом."
```

но только для реально завершённых интеграций.

- [ ] **Step 6: Прогнать lint**

Run:

```bash
npx eslint app/company/settings/content/CompanySettingsIntegrationsContent.js app/api/party/integrations/status/route.js app/api/party/integrations/avito/connect/route.js app/api/party/integrations/avito/check/route.js app/api/party/integrations/avito/disconnect/route.js app/api/party/integrations/vk/connect/route.js app/api/party/integrations/vk/check/route.js app/api/party/integrations/vk/disconnect/route.js app/api/party/integrations/novofon/connect/route.js app/api/party/integrations/novofon/disconnect/route.js app/api/party/integrations/ai/save/route.js server/avito.js server/vkGroup.js server/novofon.js server/aiSettings.js
```

Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add app/company/settings/content/CompanySettingsIntegrationsContent.js app/api/party/integrations server/avito.js server/vkGroup.js server/novofon.js server/aiSettings.js
git commit -m "feat: complete company integrations backend"
```

---

### Task 3: Довести вкладку `Документы` от MVP до полного company-level сценария

**Files:**
- Modify: `app/company/settings/content/CompanySettingsDocumentsContent.js`
- Modify: `helpers/generateContractTemplate.js`
- Modify: `helpers/generateActTemplate.js`
- Modify: `layouts/modals/modalsFunc/eventFunc.js` only if PartyCRM shares helper behavior
- Modify: party-side document generation callsites if any exist
- Optionally Create: `helpers/companyDocuments.js`

- [ ] **Step 1: Зафиксировать company-level shape `settings.documents`**

Нужные ключи:

```js
{
  documents: {
    requisites: { ... },
    contractDocxTemplateBase64: '',
    contractDocxTemplateFileName: '',
    actDocxTemplateBase64: '',
    actDocxTemplateFileName: ''
  }
}
```

- [ ] **Step 2: Перевести чтение DOCX-шаблонов на `companySettings.documents` везде, где это требуется для PartyCRM**

Нельзя оставлять hidden dependency на:

- `siteSettingsAtom`;
- `siteSettings.custom.contractDocxTemplateBase64`;
- `siteSettings.custom.actDocxTemplateBase64`.

- [ ] **Step 3: Перевести реквизиты компании на company-level storage**

Если генераторы документов или UI читают реквизиты не из `companySettings.documents.requisites`, привести их к единому источнику.

- [ ] **Step 4: Проверить, что загрузка шаблона реально влияет на итоговую генерацию**

Manual verification checklist:

- загрузить новый шаблон договора;
- перезагрузить страницу настроек;
- убедиться, что имя шаблона сохранилось;
- сгенерировать документ и проверить, что используется новый шаблон.

- [ ] **Step 5: Прогнать lint**

Run:

```bash
npx eslint app/company/settings/content/CompanySettingsDocumentsContent.js helpers/generateContractTemplate.js helpers/generateActTemplate.js layouts/modals/modalsFunc/eventFunc.js
```

Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add app/company/settings/content/CompanySettingsDocumentsContent.js helpers/generateContractTemplate.js helpers/generateActTemplate.js layouts/modals/modalsFunc/eventFunc.js
git commit -m "feat: finalize company document settings"
```

---

### Task 4: Довести вкладку `Уведомления` до чёткой company-level модели

**Files:**
- Modify: `app/company/settings/content/CompanySettingsNotificationsContent.js`
- Modify: `components/PushNotificationsSettings.js` if shared controlled extraction still needed
- Optionally Create: `components/company/CompanyPushNotificationsSettings.js`
- Modify: `app/api/push/test/route.js`
- Modify: `app/api/push/logs/route.js`
- Modify: `app/api/push/subscribe/route.js`
- Modify: `app/api/push/unsubscribe/route.js`

- [ ] **Step 1: Разделить personal и company notification settings явно**

Требование:

- `/party/settings` остаётся personal area;
- `/company/settings/notifications` пишет только company-level notification preferences;
- названия полей и storage не должны смешиваться.

- [ ] **Step 2: Если backend push endpoint уже использует company id, проверить и задокументировать это**

Если `companyId` уже прокинут:

- зафиксировать это в коде комментарием;
- удалить ambiguous fallback behavior.

Если нет:

- добавить `x-partycrm-company-id` туда, где это действительно влияет на company-level сценарий.

- [ ] **Step 3: Привести UI к controlled company-level flow**

UI вкладки должен:

- загружать `settings.notifications`;
- патчить только `notifications`;
- не зависеть от legacy atom/state других разделов.

- [ ] **Step 4: Проверить журнал/тестовую отправку**

Ручная проверка:

- включить company-level toggle;
- изменить время уведомления;
- выполнить тестовую отправку;
- убедиться, что логи не смешиваются с personal settings по крайней мере на уровне источника/подписи.

- [ ] **Step 5: Прогнать lint**

Run:

```bash
npx eslint app/company/settings/content/CompanySettingsNotificationsContent.js components/PushNotificationsSettings.js components/company/CompanyPushNotificationsSettings.js app/api/push/test/route.js app/api/push/logs/route.js app/api/push/subscribe/route.js app/api/push/unsubscribe/route.js
```

Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add app/company/settings/content/CompanySettingsNotificationsContent.js components/PushNotificationsSettings.js components/company/CompanyPushNotificationsSettings.js app/api/push/test/route.js app/api/push/logs/route.js app/api/push/subscribe/route.js app/api/push/unsubscribe/route.js
git commit -m "feat: finalize company notification settings"
```

---

### Task 5: Закрыть регрессии доступа и навигации

**Files:**
- Modify: `components/party/PartyAppShell.js`
- Modify: `app/company/settings/companySettingsTabs.js`
- Modify: `app/company/settings/companySettingsTabs.test.mjs`
- Modify: `docs/PARTYCRM_ROLES.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Проверить, что все ограничения вкладок совпадают между UI и route guard**

Нужно проверить:

- sidebar hidden state;
- direct route guard в `page.js` и `[tab]/page.js`;
- markers `admin/dev` и `dev-only`.

Если есть расхождения, источник правды должен остаться в `companySettingsTabs.js`.

- [ ] **Step 2: Добавить тесты на видимость/доступ helper-уровня**

В `companySettingsTabs.test.mjs` уже есть базовые тесты. Добавить ещё:

```js
test('general tab stays available for admin and regular company user', () => {
  assert.equal(canAccessCompanySettingsTab('general', 'user'), true)
  assert.equal(canAccessCompanySettingsTab('general', 'admin'), true)
})

test('dev-only marker config can be added without affecting admin-dev items', () => {
  assert.equal(
    getVisibleCompanySettingsTabs('admin').some((item) => item.access === 'dev'),
    false
  )
})
```

- [ ] **Step 3: Синхронизировать документацию правил**

Если к моменту выполнения появятся новые ограниченные вкладки, обновить:

- [PARTYCRM_ROLES.md](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/docs/PARTYCRM_ROLES.md)
- [AGENTS.md](/d:/Programming/Projects/ArtistCRM_PartyCRM/PartyCRM/AGENTS.md)

- [ ] **Step 4: Прогнать tests + lint**

Run:

```bash
node --test app/company/settings/companySettingsTabs.test.mjs
npx eslint components/party/PartyAppShell.js app/company/settings/companySettingsTabs.js
```

Expected: тесты `ok`, lint без ошибок.

- [ ] **Step 5: Commit**

```bash
git add components/party/PartyAppShell.js app/company/settings/companySettingsTabs.js app/company/settings/companySettingsTabs.test.mjs docs/PARTYCRM_ROLES.md AGENTS.md
git commit -m "test: lock company settings access rules"
```

---

### Task 6: Финальная ручная smoke-проверка модуля `Настройки компании`

**Files:**
- No required code changes
- Optionally Modify: `docs/superpowers/specs/2026-05-27-company-settings-design.md`
- Optionally Modify: `docs/superpowers/plans/2026-05-27-company-settings.md`

- [ ] **Step 1: Запустить локальное приложение**

Run:

```bash
npm run dev
```

Expected: dev server стартует без build errors.

- [ ] **Step 2: Проверить навигацию и раскрытие пункта**

Manual checks:

1. В company workspace пункт `Настройки компании` раскрывается по клику.
2. Подпункты видны в сайдбаре.
3. Нет двойного сайдбара.
4. На мобильном меню поведение совпадает по смыслу.

- [ ] **Step 3: Проверить все 6 вкладок**

Manual checks:

1. `/company/settings` открывает `Общие`.
2. `Списки` сохраняют города/адреса.
3. `Интеграции` читают и пишут company-level данные.
4. `Уведомления` сохраняют company-level preferences.
5. `Документы` сохраняют шаблоны и реквизиты.
6. `Тарифы` корректно ведут в тарифный сценарий.

- [ ] **Step 4: Проверить регрессию `OrderModal`**

Manual checks:

1. Новый заказ берёт `defaultOrderDurationMinutes`.
2. `PartyAddressPoolPicker` видит актуальные `towns`/`addresses`.
3. После изменений в `Списках` новый заказ использует обновлённые значения без поломок.

- [ ] **Step 5: Зафиксировать итоговый статус документации**

После smoke-проверки обновить статус snapshot в:

- `docs/superpowers/specs/2026-05-27-company-settings-design.md`
- `docs/superpowers/plans/2026-05-27-company-settings.md`

Кратко отметить:

- модуль завершён;
- что осталось outside scope, если такие хвосты осознанно оставлены.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-05-27-company-settings-design.md docs/superpowers/plans/2026-05-27-company-settings.md
git commit -m "docs: finalize company settings handoff"
```

---

## Self-Review

- Spec coverage: план покрывает именно то, что осталось после уже реализованного company settings MVP: integrations backend, documents completion, notifications parity, access regression and final smoke-test.
- Placeholder scan: в плане нет `TODO`/`TBD`; все задачи привязаны к конкретным файлам, проверкам и коммитам.
- Type consistency: везде используется одна терминология `companySettings`, `settings.integrations`, `settings.documents`, `settings.notifications`, `PartyUser.role`, `x-partycrm-company-id`.

Plan complete and saved to `docs/superpowers/plans/2026-05-27-company-settings-remaining.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
