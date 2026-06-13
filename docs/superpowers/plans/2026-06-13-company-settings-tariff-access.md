# Company Settings Tariff Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открыть все подразделы настроек владельцу и администратору компании, убрать ролевые звёзды и сохранить тарифное ограничение только внутри раздела документов.

**Architecture:** `companySettingsTabs.js` остаётся единым источником состава меню и route guard. Все вкладки получают management-доступ, а контекст проверяет активную membership `owner/admin`; глобальная роль не даёт доступ без membership. `CompanySettingsDocumentsContent` продолжает самостоятельно показывать тарифный gate по `allowDocuments`.

**Tech Stack:** Next.js App Router, React, Node test runner, Jotai/локальный client state, Tailwind CSS.

---

### Task 1: Матрица доступа вкладок

**Files:**
- Modify: `app/company/settings/companySettingsTabs.test.mjs`
- Modify: `app/company/settings/companySettingsTabs.js`

- [ ] Добавить тесты: owner/admin компании видят все вкладки; performer и пользователь без management membership не видят ни одной вкладки; глобальный admin/dev без membership не получает доступ.
- [ ] Запустить `node --test app/company/settings/companySettingsTabs.test.mjs` и подтвердить ожидаемое падение старой модели.
- [ ] Заменить `public/admin-dev` у вкладок на единый management access и реализовать проверку только `owner/admin` membership.
- [ ] Повторно запустить тест и получить PASS.

### Task 2: Меню без звёзд

**Files:**
- Modify: `components/party/PartyAppShell.js`
- Test: `app/company/settings/companySettingsTabs.test.mjs`

- [ ] Добавить assertion, что конфигурация вкладок не содержит access-marker `admin-dev/dev`.
- [ ] Удалить `faStar`, карту цветов marker и условный рендер звезды из `SubMenuLink`.
- [ ] Проверить, что `getVisibleCompanySettingsTabs` получает `activeMembership.role/isAdmin` и возвращает все вкладки только management membership.

### Task 3: Route guard активной компании

**Files:**
- Modify: `app/company/settings/page.js`
- Modify: `app/company/settings/[tab]/page.js`

- [ ] Передавать в `canAccessCompanySettingsTab` реальную активную membership (`companyRole`, `isCompanyManager`), а не общий признак наличия любой компании.
- [ ] При отсутствии management membership перенаправлять на `/company`.
- [ ] Не добавлять tariff guard для integrations/notifications/tariffs; сохранить tariff gate документов в `CompanySettingsDocumentsContent`.

### Task 4: Roadmap и версия

**Files:**
- Modify: `docs/PARTYCRM_COMPLETION_AND_LAUNCH_PLAN.md`
- Modify: `docs/PARTYCRM_ROADMAP.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Зафиксировать новую матрицу доступа и удаление глобального `admin/dev` ограничения.
- [ ] Выполнить patch bump `1.1.0 -> 1.1.1`.

### Task 5: Проверка

**Files:**
- Test: изменённые JS-файлы и существующие helper-тесты.

- [ ] Запустить `node --test app/company/settings/companySettingsTabs.test.mjs`.
- [ ] Запустить все `helpers/*.test.mjs` и связанные тесты настроек.
- [ ] Запустить точечный `npx eslint` для изменённых JS-файлов.
- [ ] Запустить `npm run build`.
- [ ] Проверить UI через Browser, если Browser доступен; иначе явно зафиксировать ограничение.
