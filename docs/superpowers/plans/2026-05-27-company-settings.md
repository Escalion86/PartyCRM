# Company Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status Snapshot (2026-05-28)

- **Done:** routing (`/company/settings/*`), sidebar entry (`PartyAppShell`), settings API normalization (`GET/PATCH /api/party/company-settings`), `useCompanySettings` hook, tabs `Общие` / `Списки` полностью, ограничения по ролям (`PartyUser.role`) в `companySettingsTabs.js`, route guard в `[tab]/page.js`, тесты табов
- **MVP Done:** `Интеграции`, `Уведомления`, `Документы`, `Тарифы` — UI готов, данные пишутся в `PartyCompanies.settings`, но backend-сценарии (connect/check/disconnect) для интеграций не доведены до company-level
- **Remaining:** компания-уровневые API для Avito/VK/Novofon/AI, реквизиты в документах, разделение personal/company в уведомлениях, финальный smoke-test — см. [2026-05-27-company-settings-remaining.md](./2026-05-27-company-settings-remaining.md)

**Goal:** Добавить в кабинет компании PartyCRM новый раздел `Настройки компании` с подпунктами `Общие`, `Интеграции`, `Списки`, `Уведомления`, `Документы`, `Тарифы`, с отдельной веткой роутов `/company/settings/*` и хранением данных в `PartyCompanies.settings`.

**Architecture:** Настройки компании реализуются как отдельный app-router модуль, а не как еще одна секция `CompanyWorkspaceClient`. Общие маршруты, tab-config, guard-логика и загрузка `companySettings` выносятся в отдельные файлы модуля `app/company/settings`. Нормализация и merge company settings выносятся в helper-слой, чтобы API, UI и тесты использовали одни и те же правила.

**Tech Stack:** Next.js App Router, React Client Components, existing `apiJson`, existing party auth/context helpers, Node `node:test`, existing PartyCRM UI components.

---

### Task 1: Скелет роутов и конфиг вкладок настроек компании

**Files:**
- Create: `app/company/settings/companySettingsTabs.js`
- Create: `app/company/settings/CompanySettingsShell.js`
- Create: `app/company/settings/page.js`
- Create: `app/company/settings/[tab]/page.js`
- Create: `app/company/settings/layout.js`
- Create: `app/company/settings/companySettingsTabs.test.mjs`
- Modify: `app/company/layout.js`
- Modify: `app/company/page.js`
- Modify: `app/company/[section]/page.js`

- [ ] **Step 1: Добавить конфиг вкладок и helper-резолвер**

```js
export const COMPANY_SETTINGS_TABS = Object.freeze([
  { slug: 'general', label: 'Общие', href: '/company/settings' },
  {
    slug: 'integrations',
    label: 'Интеграции',
    href: '/company/settings/integrations',
  },
  { slug: 'lists', label: 'Списки', href: '/company/settings/lists' },
  {
    slug: 'notifications',
    label: 'Уведомления',
    href: '/company/settings/notifications',
  },
  { slug: 'documents', label: 'Документы', href: '/company/settings/documents' },
  { slug: 'tariffs', label: 'Тарифы', href: '/company/settings/tariffs' },
])

export const DEFAULT_COMPANY_SETTINGS_TAB = 'general'

export const getCompanySettingsTab = (slug) => {
  if (!slug) return DEFAULT_COMPANY_SETTINGS_TAB
  return COMPANY_SETTINGS_TABS.some((item) => item.slug === slug) ? slug : null
}

export const getCompanySettingsHref = (slug) =>
  slug === 'general' ? '/company/settings' : `/company/settings/${slug}`
```

- [ ] **Step 2: Написать unit-тест для tab-резолвера**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_COMPANY_SETTINGS_TAB,
  getCompanySettingsHref,
  getCompanySettingsTab,
} from './companySettingsTabs.js'

test('getCompanySettingsTab returns default tab for empty slug', () => {
  assert.equal(getCompanySettingsTab(''), DEFAULT_COMPANY_SETTINGS_TAB)
})

test('getCompanySettingsTab returns null for unknown slug', () => {
  assert.equal(getCompanySettingsTab('unknown'), null)
})

test('getCompanySettingsHref keeps general tab on /company/settings', () => {
  assert.equal(getCompanySettingsHref('general'), '/company/settings')
})
```

- [ ] **Step 3: Запустить тест резолвера**

Run:

```bash
node --test app/company/settings/companySettingsTabs.test.mjs
```

Expected: `ok` по всем 3 тестам.

- [ ] **Step 4: Создать layout и shell для ветки `/company/settings/*`**

```js
import PartyAppShell from '@components/party/PartyAppShell'

export default function CompanySettingsLayout({ children }) {
  return <PartyAppShell variant="company-settings">{children}</PartyAppShell>
}
```

```js
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import cn from 'classnames'
import { COMPANY_SETTINGS_TABS } from './companySettingsTabs'

export default function CompanySettingsShell({
  title,
  description,
  activeTab,
  children,
}) {
  const pathname = usePathname()

  return (
    <section className="min-h-full bg-white px-5 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase text-sky-700">
            Настройки компании
          </p>
          <h2 className="text-2xl font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm leading-6 text-slate-500">{description}</p>
          ) : null}
        </div>

        <nav className="flex flex-wrap gap-2">
          {COMPANY_SETTINGS_TABS.map((tab) => {
            const active = activeTab === tab.slug || pathname === tab.href
            return (
              <Link
                key={tab.slug}
                href={tab.href}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {children}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Создать server pages для default и dynamic tab route**

```js
import { redirect } from 'next/navigation'

export default function CompanySettingsPage() {
  redirect('/company/settings')
}
```

```js
import { notFound } from 'next/navigation'
import { getCompanySettingsTab } from '../companySettingsTabs'

export default async function CompanySettingsTabPage({ params }) {
  const resolvedParams = await params
  const tab = getCompanySettingsTab(resolvedParams?.tab)
  if (!tab) return notFound()
  return null
}
```

Note: в реализации Task 2 эта страница начнет возвращать контент-shell вместо `null`.

- [ ] **Step 6: Запустить smoke-проверку lint для новых файлов**

Run:

```bash
npm run lint -- app/company/settings/companySettingsTabs.js app/company/settings/CompanySettingsShell.js app/company/settings/page.js app/company/settings/[tab]/page.js app/company/settings/layout.js
```

Expected: без ошибок ESLint.

- [ ] **Step 7: Commit**

```bash
git add app/company/settings app/company/layout.js app/company/page.js app/company/[section]/page.js docs/superpowers/plans/2026-05-27-company-settings.md
git commit -m "feat: scaffold company settings routes"
```

### Task 2: Доступ, навигация сайдбара и page-dispatch для company settings

**Files:**
- Create: `app/company/settings/CompanySettingsPageContent.js`
- Create: `app/company/settings/getCompanySettingsPageMeta.js`
- Modify: `components/party/PartyAppShell.js`
- Modify: `app/company/settings/page.js`
- Modify: `app/company/settings/[tab]/page.js`
- Modify: `app/company/settings/layout.js`
- Modify: `server/partyEntry.js`
- Test: `app/company/settings/companySettingsTabs.test.mjs`

- [ ] **Step 1: Добавить новый пункт в company sidebar**

```js
const companyMenu = [
  { href: '/company', label: 'Обзор', icon: faHome },
  { href: '/company/orders', label: 'Предстоящие заказы', icon: faCalendarCheck },
  { href: '/company/orders-past', label: 'Прошедшие заказы', icon: faClockRotateLeft },
  { href: '/company/clients', label: 'Клиенты', icon: faAddressBook },
  { href: '/company/finance', label: 'Финансы', icon: faChartLine },
  { href: '/company/locations', label: 'Точки', icon: faLocationDot },
  { href: '/company/staff', label: 'Сотрудники', icon: faUserGroup },
  { href: '/company/settings', label: 'Настройки компании', icon: faGear },
]
```

- [ ] **Step 2: Добавить variant `company-settings` в `PartyAppShell`**

```js
const primaryMenu =
  variant === 'performer'
    ? performerMenu
    : variant === 'settings'
      ? canUseCompany
        ? companyMenu
        : canUsePerformer
          ? performerMenu
          : []
      : variant === 'company-settings'
        ? companyMenu
        : companyMenu

if (variant === 'company-settings') return 'Настройки компании'
```

- [ ] **Step 3: Добавить server-dispatch с guard-логикой и metadata**

```js
import { notFound, redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'
import CompanySettingsPageContent from './CompanySettingsPageContent'
import { getCompanySettingsTab } from './companySettingsTabs'

export const dynamic = 'force-dynamic'

export default async function CompanySettingsPage({ params }) {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/company/settings')

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUseCompany) redirect('/party/entry')
  if (!state.companyReady) redirect('/company/master')

  const resolvedParams = await params
  const tab = getCompanySettingsTab(resolvedParams?.tab ?? 'general')
  if (!tab) return notFound()

  return <CompanySettingsPageContent activeTab={tab} />
}
```

- [ ] **Step 4: Создать page-content dispatcher под вкладки**

```js
import CompanySettingsShell from './CompanySettingsShell'

const TITLES = {
  general: {
    title: 'Общие',
    description: 'Базовые параметры компании и поведения кабинета.',
  },
  integrations: {
    title: 'Интеграции',
    description: 'Подключение внешних сервисов на уровне компании.',
  },
  lists: {
    title: 'Списки',
    description: 'Редактируемые справочники компании.',
  },
  notifications: {
    title: 'Уведомления',
    description: 'Push и служебные уведомления компании.',
  },
  documents: {
    title: 'Документы',
    description: 'Реквизиты и DOCX-шаблоны компании.',
  },
  tariffs: {
    title: 'Тарифы',
    description: 'Тариф компании и доступные опции.',
  },
}

export default function CompanySettingsPageContent({ activeTab }) {
  const meta = TITLES[activeTab]
  return (
    <CompanySettingsShell
      activeTab={activeTab}
      title={meta.title}
      description={meta.description}
    >
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-600">
        Вкладка {meta.title} будет подключена в следующих задачах плана.
      </div>
    </CompanySettingsShell>
  )
}
```

- [ ] **Step 5: Обновить тест на sidebar/default route**

```js
test('company settings general href uses root settings route', () => {
  assert.equal(getCompanySettingsHref('general'), '/company/settings')
})
```

- [ ] **Step 6: Проверить lint и таб-тест**

Run:

```bash
node --test app/company/settings/companySettingsTabs.test.mjs
npm run lint -- components/party/PartyAppShell.js app/company/settings/CompanySettingsPageContent.js app/company/settings/page.js app/company/settings/[tab]/page.js
```

Expected: тест green, ESLint без ошибок.

- [ ] **Step 7: Commit**

```bash
git add components/party/PartyAppShell.js app/company/settings server/partyEntry.js
git commit -m "feat: add company settings navigation"
```

### Task 3: Общий company-settings store, нормализаторы и PATCH API

**Files:**
- Create: `helpers/companySettings.js`
- Create: `helpers/companySettings.test.mjs`
- Create: `app/company/settings/useCompanySettings.js`
- Modify: `app/api/party/company-settings/route.js`
- Modify: `app/company/CompanyWorkspaceClient.js`

- [ ] **Step 1: Вынести нормализацию и merge-логику в helper**

```js
import {
  getAddressPoolSignature,
  normalizeAddressPoolString,
  normalizePartyPoolAddress,
} from '@helpers/addressPool'

export const DEFAULT_COMPANY_SETTINGS = Object.freeze({
  timeZone: 'Asia/Krasnoyarsk',
  defaultOrderDurationMinutes: 60,
  towns: [],
  addresses: [],
  eventTypes: [],
  notifications: {},
  documents: {},
  integrations: {},
})

export const normalizeCompanySettings = (value = {}) => ({
  ...DEFAULT_COMPANY_SETTINGS,
  ...value,
  timeZone: String(value?.timeZone || 'Asia/Krasnoyarsk'),
  defaultOrderDurationMinutes: Math.max(
    15,
    Number(value?.defaultOrderDurationMinutes || 60)
  ),
  towns: normalizeCompanyTowns(value?.towns),
  addresses: normalizeCompanyAddresses(value?.addresses),
  eventTypes: normalizeCompanyEventTypes(value?.eventTypes),
  notifications: typeof value?.notifications === 'object' && value?.notifications
    ? value.notifications
    : {},
  documents: typeof value?.documents === 'object' && value?.documents
    ? value.documents
    : {},
  integrations: typeof value?.integrations === 'object' && value?.integrations
    ? value.integrations
    : {},
})

export const mergeCompanySettingsPatch = (current, patch) =>
  normalizeCompanySettings({
    ...normalizeCompanySettings(current),
    ...patch,
  })
```

- [ ] **Step 2: Добавить unit-тесты на towns, eventTypes и merge**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeCompanySettingsPatch,
  normalizeCompanySettings,
} from './companySettings.js'

test('normalizeCompanySettings deduplicates towns', () => {
  const settings = normalizeCompanySettings({ towns: ['Москва', ' Москва ', ''] })
  assert.deepEqual(settings.towns, ['Москва'])
})

test('mergeCompanySettingsPatch keeps previous notifications object', () => {
  const next = mergeCompanySettingsPatch(
    { notifications: { pushEnabled: true } },
    { timeZone: 'Europe/Moscow' }
  )
  assert.equal(next.timeZone, 'Europe/Moscow')
  assert.equal(next.notifications.pushEnabled, true)
})
```

- [ ] **Step 3: Запустить unit-тест helper-а**

Run:

```bash
node --test helpers/companySettings.test.mjs
```

Expected: оба теста green.

- [ ] **Step 4: Переписать `GET/PATCH /api/party/company-settings` на helper**

```js
import {
  mergeCompanySettingsPatch,
  normalizeCompanySettings,
} from '@helpers/companySettings'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId).select({ settings: 1 }).lean()

  return NextResponse.json({
    success: true,
    data: normalizeCompanySettings(company?.settings ?? {}),
  })
}

export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error

  const body = await parseJsonBody(req)
  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId).select({ settings: 1 }).lean()
  const nextSettings = mergeCompanySettingsPatch(company?.settings ?? {}, body)

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: { settings: nextSettings } }
  )

  return NextResponse.json({ success: true, data: nextSettings })
}
```

- [ ] **Step 5: Создать shared client-hook для company settings**

```js
'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

export default function useCompanySettings(activeCompanyId) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const requestOptions = useCallback(
    (options = {}) => ({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        'x-partycrm-company-id': activeCompanyId,
      },
    }),
    [activeCompanyId]
  )

  const load = useCallback(async () => {
    if (!activeCompanyId) return
    setLoading(true)
    setError('')
    try {
      const response = await apiJson(
        '/api/party/company-settings',
        requestOptions({ cache: 'no-store' })
      )
      setSettings(response.data ?? {})
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить настройки компании')
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, requestOptions])

  const savePatch = useCallback(async (patch) => {
    setSaving(true)
    try {
      const response = await apiJson(
        '/api/party/company-settings',
        requestOptions({ method: 'PATCH', body: JSON.stringify(patch) })
      )
      setSettings(response.data ?? {})
      return response.data ?? {}
    } finally {
      setSaving(false)
    }
  }, [requestOptions])

  useEffect(() => {
    load()
  }, [load])

  return { settings, setSettings, loading, saving, error, reload: load, savePatch }
}
```

- [ ] **Step 6: Подменить прямую загрузку `companySettings` в `CompanyWorkspaceClient` на helper-совместимый формат**

```js
setCompanySettings(companySettingsResponse.data ?? {})
```

оставить, но после Task 3 ожидать уже нормализованные данные из API, без локальной нормализации в самом `CompanyWorkspaceClient`.

- [ ] **Step 7: Проверить тест и lint**

Run:

```bash
node --test helpers/companySettings.test.mjs
npm run lint -- helpers/companySettings.js app/api/party/company-settings/route.js app/company/settings/useCompanySettings.js app/company/CompanyWorkspaceClient.js
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add helpers/companySettings.js helpers/companySettings.test.mjs app/api/party/company-settings/route.js app/company/settings/useCompanySettings.js app/company/CompanyWorkspaceClient.js
git commit -m "feat: normalize company settings api"
```

### Task 4: Реализовать вкладки `Общие` и `Списки`

**Files:**
- Create: `app/company/settings/content/CompanySettingsGeneralContent.js`
- Create: `app/company/settings/content/CompanySettingsListsContent.js`
- Create: `app/company/settings/content/companySettingsContentMap.js`
- Create: `app/company/settings/content/companySettingsTimeZones.js`
- Modify: `app/company/settings/CompanySettingsPageContent.js`
- Modify: `components/AddressPoolPicker.js`
- Modify: `components/party/inputs/PartyAddressPoolPicker.js`
- Modify: `components/party/modals/OrderModal.js`
- Test: `helpers/companySettings.test.mjs`

- [ ] **Step 1: Подключить content-map для active tab**

```js
import CompanySettingsGeneralContent from './content/CompanySettingsGeneralContent'
import CompanySettingsListsContent from './content/CompanySettingsListsContent'

export const COMPANY_SETTINGS_CONTENT = Object.freeze({
  general: CompanySettingsGeneralContent,
  lists: CompanySettingsListsContent,
})
```

```js
const Component =
  COMPANY_SETTINGS_CONTENT[activeTab] ||
  (() => <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 p-6 text-sm text-slate-500">Раздел в работе</div>)
```

- [ ] **Step 2: Реализовать `Общие` через `useCompanySettings`**

```js
'use client'

import { useEffect, useState } from 'react'
import useCompanySettings from '../useCompanySettings'

export default function CompanySettingsGeneralContent({ activeCompanyId }) {
  const { settings, loading, saving, error, savePatch } = useCompanySettings(activeCompanyId)
  const [duration, setDuration] = useState(60)

  useEffect(() => {
    setDuration(Number(settings?.defaultOrderDurationMinutes || 60))
  }, [settings?.defaultOrderDurationMinutes])

  if (loading) return <div className="text-sm text-slate-500">Загрузка...</div>

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Часовой пояс компании</span>
          <select
            value={settings?.timeZone ?? 'Asia/Krasnoyarsk'}
            onChange={(event) => savePatch({ timeZone: event.target.value })}
            className="h-11 rounded-lg border border-sky-100 px-3"
          >
            <option value="Asia/Krasnoyarsk">UTC+07 Красноярск</option>
            <option value="Europe/Moscow">UTC+03 Москва</option>
          </select>
        </label>
      </div>
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Стандартная длительность заказа, мин</span>
          <input
            type="number"
            min={15}
            step={5}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value || 60))}
            onBlur={() => savePatch({ defaultOrderDurationMinutes: duration })}
            className="h-11 max-w-40 rounded-lg border border-sky-100 px-3"
          />
        </label>
        {saving ? <div className="mt-2 text-xs text-slate-500">Сохраняем...</div> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Реализовать `Списки` для `towns`, `eventTypes`, `addresses`**

```js
'use client'

import useCompanySettings from '../useCompanySettings'

export default function CompanySettingsListsContent({ activeCompanyId }) {
  const { settings, loading, saving, savePatch } = useCompanySettings(activeCompanyId)

  if (loading) return <div className="text-sm text-slate-500">Загрузка...</div>

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="mb-3 text-sm font-semibold">Города</div>
        <textarea
          defaultValue={(settings?.towns ?? []).join('\n')}
          onBlur={(event) =>
            savePatch({ towns: event.target.value.split('\n') })
          }
          className="min-h-40 w-full rounded-lg border border-sky-100 px-3 py-3"
        />
      </div>
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="mb-3 text-sm font-semibold">Типы мероприятий</div>
        <textarea
          defaultValue={(settings?.eventTypes ?? []).join('\n')}
          onBlur={(event) =>
            savePatch({ eventTypes: event.target.value.split('\n') })
          }
          className="min-h-40 w-full rounded-lg border border-sky-100 px-3 py-3"
        />
      </div>
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="mb-3 text-sm font-semibold">Быстрые адреса</div>
      </div>
      {saving ? <div className="text-xs text-slate-500">Сохраняем изменения...</div> : null}
    </div>
  )
}
```

- [ ] **Step 4: Подтянуть `addresses` через уже существующий party address picker**

```js
<PartyAddressPoolPicker
  poolAddresses={settings?.addresses ?? []}
  onSaveAddress={(nextAddresses) => savePatch({ addresses: nextAddresses })}
  towns={settings?.towns ?? []}
/>
```

Если `PartyAddressPoolPicker` пока не поддерживает controlled API полностью, доработать его вместо зависимостей на `siteSettingsAtom`.

- [ ] **Step 5: Сохранить обратную совместимость `OrderModal`**

```js
const defaultDuration =
  Number(companySettings?.defaultOrderDurationMinutes || 60) || 60
```

и использовать это значение при создании заказа вместо hardcoded `60`, где это применимо.

- [ ] **Step 6: Проверить unit-тест helper-а и lint**

Run:

```bash
node --test helpers/companySettings.test.mjs
npm run lint -- app/company/settings/content/CompanySettingsGeneralContent.js app/company/settings/content/CompanySettingsListsContent.js app/company/settings/CompanySettingsPageContent.js components/party/inputs/PartyAddressPoolPicker.js components/party/modals/OrderModal.js
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add app/company/settings/content app/company/settings/CompanySettingsPageContent.js components/party/inputs/PartyAddressPoolPicker.js components/party/modals/OrderModal.js
git commit -m "feat: add company general and lists settings"
```

### Task 5: Реализовать вкладки `Тарифы` и `Документы`

**Files:**
- Create: `app/company/settings/content/CompanySettingsTariffsContent.js`
- Create: `app/company/settings/content/CompanySettingsDocumentsContent.js`
- Create: `app/api/party/public/docs/docx-documents/route.js`
- Modify: `app/company/settings/content/companySettingsContentMap.js`
- Modify: `layouts/content/DocumentsContent.js`
- Modify: `helpers/generateContractTemplate.js`
- Modify: `helpers/generateActTemplate.js`
- Modify: `layouts/modals/modalsFunc/eventFunc.js`

- [ ] **Step 1: Встроить тарифную админку в company settings как отдельный content**

```js
import Link from 'next/link'

export default function CompanySettingsTariffsContent() {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Тариф компании</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Управление тарифами и биллингом пока остается на текущей party-странице.
        </p>
        <Link
          href="/party/tariffs"
          className="mt-4 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Открыть тарифы
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Перенести `DocumentsContent` на controlled company settings**

```js
'use client'

import useCompanySettings from '../useCompanySettings'

export default function CompanySettingsDocumentsContent({ activeCompanyId }) {
  const { settings, loading, savePatch } = useCompanySettings(activeCompanyId)

  const saveDocxTemplate = async (type, file) => {
    const base64 = await readFileAsBase64(file)
    const documents = { ...(settings?.documents ?? {}) }
    if (type === 'contract') {
      documents.contractDocxTemplateBase64 = base64
      documents.contractDocxTemplateFileName = file.name
    } else {
      documents.actDocxTemplateBase64 = base64
      documents.actDocxTemplateFileName = file.name
    }
    await savePatch({ documents })
  }

  if (loading) return <div className="text-sm text-slate-500">Загрузка...</div>
  return <div className="grid gap-4">{/* карточки DOCX и реквизитов */}</div>
}
```

- [ ] **Step 3: Добавить company-scoped route для DOCX инструкции**

```js
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function GET() {
  const filePath = path.join(process.cwd(), 'docs', 'DOCX_DOCUMENTS_GUIDE.md')
  const content = await readFile(filePath, 'utf8')
  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
```

- [ ] **Step 4: Перевести генерацию договоров/актов на `settings.documents`**

```js
const contractTemplateBase64 =
  companySettings?.documents?.contractDocxTemplateBase64 || ''
const actTemplateBase64 =
  companySettings?.documents?.actDocxTemplateBase64 || ''
```

и использовать это чтение в `eventFunc.js` вместо `siteSettings.custom.contractDocxTemplateBase64` и `siteSettings.custom.actDocxTemplateBase64`.

- [ ] **Step 5: Перевести реквизиты компании на company settings**

```js
const companyRequisites = companySettings?.documents?.requisites ?? {}
```

и обновить места, где helpers документов читают artist-specific requisites из user/site storage.

- [ ] **Step 6: Проверить lint**

Run:

```bash
npm run lint -- app/company/settings/content/CompanySettingsTariffsContent.js app/company/settings/content/CompanySettingsDocumentsContent.js app/api/party/public/docs/docx-documents/route.js layouts/modals/modalsFunc/eventFunc.js helpers/generateContractTemplate.js helpers/generateActTemplate.js
```

Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add app/company/settings/content/CompanySettingsTariffsContent.js app/company/settings/content/CompanySettingsDocumentsContent.js app/api/party/public/docs/docx-documents/route.js layouts/modals/modalsFunc/eventFunc.js helpers/generateContractTemplate.js helpers/generateActTemplate.js
git commit -m "feat: add company documents and tariffs settings"
```

### Task 6: Реализовать вкладку `Уведомления` на company-level storage

**Files:**
- Create: `app/company/settings/content/CompanySettingsNotificationsContent.js`
- Create: `components/company/CompanyPushNotificationsSettings.js`
- Modify: `app/company/settings/content/companySettingsContentMap.js`
- Modify: `components/PushNotificationsSettings.js`
- Modify: `app/api/push/test/route.js`
- Modify: `app/api/push/logs/route.js`
- Modify: `app/api/push/subscribe/route.js`
- Modify: `app/api/push/unsubscribe/route.js`

- [ ] **Step 1: Вынести UI push-настроек в controlled component**

```js
export default function CompanyPushNotificationsSettings({
  settings,
  saving,
  onSavePatch,
  onRefreshLogs,
  logs,
}) {
  const notifications = settings?.notifications ?? {}
  const isPushEnabled = notifications.pushEnabled === true
  const reminderTime = notifications.additionalEventsPushTime || '10:00'

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() =>
          onSavePatch({
            notifications: {
              ...notifications,
              pushEnabled: !isPushEnabled,
            },
          })
        }
      >
        {isPushEnabled ? 'Отключить push' : 'Включить push'}
      </button>
      <input
        type="time"
        step="900"
        value={reminderTime}
        onChange={(event) =>
          onSavePatch({
            notifications: {
              ...notifications,
              additionalEventsPushTime: event.target.value,
            },
          })
        }
      />
    </div>
  )
}
```

- [ ] **Step 2: Собрать company notifications page через `useCompanySettings`**

```js
'use client'

import useCompanySettings from '../useCompanySettings'
import CompanyPushNotificationsSettings from '@components/company/CompanyPushNotificationsSettings'

export default function CompanySettingsNotificationsContent({ activeCompanyId }) {
  const { settings, loading, saving, savePatch } = useCompanySettings(activeCompanyId)
  if (loading) return <div className="text-sm text-slate-500">Загрузка...</div>
  return (
    <CompanyPushNotificationsSettings
      settings={settings}
      saving={saving}
      onSavePatch={savePatch}
      logs={[]}
      onRefreshLogs={() => {}}
    />
  )
}
```

- [ ] **Step 3: Изолировать legacy `PushNotificationsSettings`**

```js
// оставить текущий компонент для /party/settings и Artist-like use-cases,
// но не использовать его в company settings tab.
```

То есть не делать forced-рефакторинг всей старой логики в одной задаче.

- [ ] **Step 4: Добавить company-id в push backend там, где это нужно**

```js
const companyId = req.headers.get('x-partycrm-company-id') || ''
```

и прокинуть этот идентификатор в:

- тестовую отправку;
- логирование;
- подписку/отписку.

Если конкретный endpoint не должен быть company-scoped, это должно быть явно документировано в комментарии рядом с кодом.

- [ ] **Step 5: Сохранить формат logs/subscribe без регрессии**

```js
const source = companyId ? 'company_settings' : 'settings'
```

чтобы UI журнала мог различать события личных и company-level настроек.

- [ ] **Step 6: Проверить lint**

Run:

```bash
npm run lint -- app/company/settings/content/CompanySettingsNotificationsContent.js components/company/CompanyPushNotificationsSettings.js components/PushNotificationsSettings.js app/api/push/test/route.js app/api/push/logs/route.js app/api/push/subscribe/route.js app/api/push/unsubscribe/route.js
```

Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add app/company/settings/content/CompanySettingsNotificationsContent.js components/company/CompanyPushNotificationsSettings.js components/PushNotificationsSettings.js app/api/push/test/route.js app/api/push/logs/route.js app/api/push/subscribe/route.js app/api/push/unsubscribe/route.js
git commit -m "feat: add company notification settings"
```

### Task 7: Реализовать вкладку `Интеграции` на company-level API и storage

**Files:**
- Create: `app/company/settings/content/CompanySettingsIntegrationsContent.js`
- Create: `app/api/party/integrations/status/route.js`
- Create: `app/api/party/integrations/avito/connect/route.js`
- Create: `app/api/party/integrations/avito/check/route.js`
- Create: `app/api/party/integrations/avito/disconnect/route.js`
- Create: `app/api/party/integrations/vk/connect/route.js`
- Create: `app/api/party/integrations/vk/check/route.js`
- Create: `app/api/party/integrations/vk/disconnect/route.js`
- Create: `app/api/party/integrations/google-calendar/status/route.js`
- Create: `app/api/party/integrations/novofon/status/route.js`
- Create: `app/api/party/integrations/aitunnel/status/route.js`
- Modify: `app/company/settings/content/companySettingsContentMap.js`
- Modify: `server/avito.js`
- Modify: `server/vkGroup.js`
- Modify: `server/novofon.js`
- Modify: `server/aiSettings.js`
- Modify: `app/api/integrations/avito/*` or party equivalents only when reuse is impossible

- [ ] **Step 1: Создать единый status-endpoint для company integrations**

```js
import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import { getPartyCompanyModel } from '@server/partyModels'
import { normalizeAvitoSettings } from '@server/avito'
import { normalizeVkSettings } from '@server/vkGroup'
import { getNovofonSettings } from '@server/novofon'
import { getTenantAiSettings } from '@server/aiSettings'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId).select({ settings: 1 }).lean()
  const custom = company?.settings?.integrations ?? {}

  return NextResponse.json({
    success: true,
    data: {
      avito: normalizeAvitoSettings(custom),
      vk: normalizeVkSettings(custom),
      novofon: getNovofonSettings(custom),
      ai: getTenantAiSettings(custom),
    },
  })
}
```

- [ ] **Step 2: Адаптировать `server/avito.js`, `server/vkGroup.js`, `server/novofon.js`, `server/aiSettings.js` под вход `custom-like object`**

```js
const readCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

export const normalizeAvitoSettings = (custom) => ({
  enabled: readCustomValue(custom, 'avitoEnabled') === true,
  clientId: normalizeText(readCustomValue(custom, 'avitoClientId'), 256),
  // ...
})
```

Цель: эти нормализаторы должны работать и с legacy `siteSettings.custom`, и с новым `companySettings.integrations`.

- [ ] **Step 3: Собрать company integrations content на основе уже существующего UI-паттерна**

```js
'use client'

import { apiJson } from '@helpers/apiClient'
import { useEffect, useState } from 'react'

export default function CompanySettingsIntegrationsContent({ activeCompanyId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiJson('/api/party/integrations/status', {
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': activeCompanyId },
    }).then((response) => {
      setData(response.data)
      setLoading(false)
    })
  }, [activeCompanyId])

  if (loading) return <div className="text-sm text-slate-500">Загрузка...</div>
  return <div className="grid gap-4">{/* accordions Avito/VK/Novofon/AITunnel */}</div>
}
```

- [ ] **Step 4: Перенести connect/check/disconnect для Avito и VK в `/api/party/integrations/*`**

```js
const response = await apiJson('/api/party/integrations/avito/connect', {
  method: 'POST',
  headers: { 'x-partycrm-company-id': activeCompanyId },
  body: JSON.stringify({ clientId, clientSecret, userId }),
})
```

Внутри route:

```js
const company = await PartyCompanies.findById(context.tenantId).select({ settings: 1 })
const integrations = { ...(company.settings?.integrations ?? {}) }
integrations.avitoClientId = body.clientId
integrations.avitoClientSecret = body.clientSecret
await PartyCompanies.updateOne({ _id: context.tenantId }, { $set: { 'settings.integrations': integrations } })
```

- [ ] **Step 5: Реализовать page-level fallback для неподдержанных party integrations**

```js
<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
  Google Calendar пока не переведен на company-level backend и показывается как read-only блок.
</div>
```

Это лучше, чем фальшиво показывать рабочий UI без backend.

- [ ] **Step 6: Проверить lint**

Run:

```bash
npm run lint -- app/company/settings/content/CompanySettingsIntegrationsContent.js app/api/party/integrations/status/route.js app/api/party/integrations/avito/connect/route.js app/api/party/integrations/vk/connect/route.js server/avito.js server/vkGroup.js server/novofon.js server/aiSettings.js
```

Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add app/company/settings/content/CompanySettingsIntegrationsContent.js app/api/party/integrations server/avito.js server/vkGroup.js server/novofon.js server/aiSettings.js
git commit -m "feat: add company integrations settings"
```

### Task 8: Финальная сборка модуля и регрессии company workspace

**Files:**
- Modify: `app/company/settings/CompanySettingsPageContent.js`
- Modify: `app/company/settings/content/companySettingsContentMap.js`
- Modify: `components/party/PartyAppShell.js`
- Modify: `app/company/CompanyWorkspaceClient.js`
- Test: `helpers/companySettings.test.mjs`
- Test: `app/company/settings/companySettingsTabs.test.mjs`

- [ ] **Step 1: Подключить все реализованные content-компоненты в final map**

```js
import CompanySettingsGeneralContent from './CompanySettingsGeneralContent'
import CompanySettingsIntegrationsContent from './CompanySettingsIntegrationsContent'
import CompanySettingsListsContent from './CompanySettingsListsContent'
import CompanySettingsNotificationsContent from './CompanySettingsNotificationsContent'
import CompanySettingsDocumentsContent from './CompanySettingsDocumentsContent'
import CompanySettingsTariffsContent from './CompanySettingsTariffsContent'

export const COMPANY_SETTINGS_CONTENT = Object.freeze({
  general: CompanySettingsGeneralContent,
  integrations: CompanySettingsIntegrationsContent,
  lists: CompanySettingsListsContent,
  notifications: CompanySettingsNotificationsContent,
  documents: CompanySettingsDocumentsContent,
  tariffs: CompanySettingsTariffsContent,
})
```

- [ ] **Step 2: Подать `activeCompanyId` из current context в company settings pages**

```js
<Component activeCompanyId={activeCompanyId} />
```

Где `activeCompanyId` берется из `localStorage` по тому же ключу `partycrm.activeCompanyId`, который уже используется в company workspace.

- [ ] **Step 3: Прогнать unit-тесты**

Run:

```bash
node --test helpers/companySettings.test.mjs
node --test app/company/settings/companySettingsTabs.test.mjs
```

Expected: все green.

- [ ] **Step 4: Прогнать lint по модулю company settings**

Run:

```bash
npm run lint -- app/company/settings components/company helpers/companySettings.js app/api/party/company-settings/route.js app/api/party/integrations
```

Expected: без ошибок ESLint.

- [ ] **Step 5: Выполнить ручную smoke-проверку в браузере**

Run:

```bash
npm run dev
```

Manual checks:

- открыть `/company/settings`;
- проверить видимость пункта `Настройки компании` в сайдбаре;
- открыть все 6 подпунктов;
- изменить `timeZone` и `defaultOrderDurationMinutes`;
- изменить `towns` и убедиться, что `OrderModal` видит новые значения;
- загрузить DOCX-шаблон;
- открыть тарифную вкладку и переход в `/party/tariffs`;
- открыть `Уведомления` и проверить сохранение company-level patch;
- открыть `Интеграции` и проверить status/load для каждого блока.

Expected: навигация работает, страницы не падают, значения сохраняются.

- [ ] **Step 6: Commit**

```bash
git add app/company/settings components/company helpers/companySettings.js app/api/party/company-settings/route.js app/api/party/integrations
git commit -m "feat: complete company settings module"
```

## Self-Review

- Spec coverage: план покрывает navigation, отдельную ветку роутов, общий company settings API, вкладки `Общие`, `Интеграции`, `Списки`, `Уведомления`, `Документы`, `Тарифы`, а также регрессии рабочего кабинета компании.
- Placeholder scan: в плане нет `TODO`, `TBD`, `потом`, `реализовать позже`; все задачи привязаны к конкретным файлам, командам и кодовым направлениям.
- Type consistency: во всех задачах используется единая терминология `companySettings`, `settings.documents`, `settings.notifications`, `settings.integrations`, `defaultOrderDurationMinutes`, `activeCompanyId`, `COMPANY_SETTINGS_TABS`.

Plan complete and saved to `docs/superpowers/plans/2026-05-27-company-settings.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
