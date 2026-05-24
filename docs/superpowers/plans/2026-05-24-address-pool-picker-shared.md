# Shared AddressPoolPicker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переиспользовать один `AddressPoolPicker` в ArtistCRM и PartyCRM, оставив различия только в источнике данных и party-оформлении.

**Architecture:** Общая логика остается в `components/AddressPoolPicker.js`. PartyCRM получает тонкую обертку над ним, которая читает и сохраняет пул адресов через `companySettings` активной компании. `OrderModal` переключается на новую обертку без собственного дублирующего UI.

**Tech Stack:** Next.js App Router, React, Jotai, Tailwind CSS, существующие UI-компоненты проекта.

---

### Task 1: Подготовить общий API адресного компонента

**Files:**
- Modify: `components/AddressPoolPicker.js`
- Modify: `components/AddressPicker.js`

- [ ] Выделить в `AddressPoolPicker` управляемые пропсы для внешнего пула адресов, сохранения адреса, списка городов и визуального тона.
- [ ] Добавить в `AddressPicker` поддержку party-варианта полей адреса без поломки текущего artist-варианта.
- [ ] Сохранить backward compatibility для существующего вызова из `layouts/modals/modalsFunc/eventFunc.js`.

### Task 2: Добавить PartyCRM-обертку

**Files:**
- Create: `components/party/inputs/PartyAddressPoolPicker.js`
- Modify: `app/api/party/company-settings/route.js`

- [ ] Собрать party-обертку, которая берет `addresses` и `towns` из `companySettings`.
- [ ] Реализовать сохранение адресов и городов в `PATCH /api/party/company-settings`.
- [ ] Сохранить company-scoped модель через `x-partycrm-company-id`.

### Task 3: Переключить форму заказа PartyCRM

**Files:**
- Modify: `components/party/modals/OrderModal.js`
- Stop using legacy party-specific address picker

- [ ] Подменить legacy party picker на новую обертку.
- [ ] Сохранить сборку `customAddress` и поведение заказа на выезде.
- [ ] Не затронуть прочие поля и сценарии модалки заказа.

### Task 4: Проверка и завершение

**Files:**
- Modify if needed: `docs/PARTYCRM_ROADMAP.md`
- Modify if needed: `docs/ROADMAP.md`
- Modify if needed: `package.json`

- [ ] Проверить, закрывает ли задача roadmap-пункт. Если нет, roadmap и версия не менять.
- [ ] Прогнать точечный `eslint` по измененным файлам.
- [ ] Зафиксировать ограничения: в проекте нет готового тестового раннера для TDD вокруг этого UI-сценария, поэтому верификация будет через lint и ручную проверку.
