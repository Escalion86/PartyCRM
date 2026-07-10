import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('performer settings integrations exposes google calendar settings', async () => {
  const component = await source(
    'app/performer/settings/content/PerformerSettingsIntegrationsContent.js'
  )
  const calendarSettings = await source(
    'components/party/settings/PerformerGoogleCalendarSettings.js'
  )
  const shell = await source('components/party/PartyAppShell.js')

  assert.match(component, /PerformerGoogleCalendarSettings/)
  assert.match(calendarSettings, /\/api\/party\/performer\/google-calendar\/status/)
  assert.doesNotMatch(component, /ICS-файл/)
  assert.doesNotMatch(component, /\/api\/party\/performer\/calendar/)
  assert.match(shell, /PERFORMER_SETTINGS_TABS/)
  assert.match(shell, /isPerformerSettingsPath/)
})

test('performer settings exposes personal push notifications', async () => {
  const tabs = await source('app/performer/settings/performerSettingsTabs.js')
  const page = await source('app/performer/settings/PerformerSettingsPageContent.js')
  const component = await source(
    'app/performer/settings/content/PerformerSettingsNotificationsContent.js'
  )
  const api = await source('app/api/party/performer/notifications/route.js')
  const testPushApi = await source(
    'app/api/party/performer/push/test/route.js'
  )
  const performerPush = await source('server/partyPerformerPush.js')

  assert.match(tabs, /slug: 'notifications'/)
  assert.match(tabs, /href: '\/performer\/settings\/notifications'/)
  assert.match(page, /PerformerSettingsNotificationsContent/)
  assert.match(component, /\/api\/party\/performer\/notifications/)
  assert.match(component, /\/api\/party\/performer\/push\/test/)
  assert.match(api, /performerSettings\.notifications\.pushEnabled/)
  assert.match(testPushApi, /buildPartyPerformerTestPushPayload/)
  assert.match(performerPush, /performerSettings\?\.notifications\?\.pushEnabled !== false/)
})

test('performer settings profile edits only account profile', async () => {
  const component = await source(
    'app/performer/settings/content/PerformerSettingsProfileContent.js'
  )
  const api = await source('app/api/party/performer/profile/route.js')

  assert.match(component, /Сохранить профиль/)
  assert.doesNotMatch(component, /specializationOptions/)
  assert.doesNotMatch(component, /Данные, видимые этой компании/)
  assert.doesNotMatch(api, /PartyStaff\.updateOne/)
})

test('performer order cards expose contacts, services and guarded done action', async () => {
  const component = await source('app/performer/PerformerWorkspaceClient.js')
  const route = await source('app/api/party/performer/orders/route.js')
  const sanitizer = await source('helpers/partyPerformerOrders.js')

  assert.match(component, /ContactsIconsButtons/)
  assert.match(component, /formatCompanyTitle/)
  assert.match(component, /Компания "\$\{title\}"/)
  assert.match(component, /order\.serviceTitles/)
  assert.match(component, /order\.performerComment/)
  assert.match(component, /order\.responsibleStaff/)
  assert.match(component, /Ответственный:/)
  assert.match(component, /canEditReport/)
  assert.match(component, /getReportAccessMessage/)
  assert.match(component, /Отчет будет доступен после начала заказа/)
  assert.match(component, /const hasStarted = isOrderStarted\(order\)/)
  assert.match(component, /setReportOrderKey\(orderKey\)/)
  assert.match(component, /Отчет/)
  assert.match(component, /confirmationStatus === 'confirmed'/)
  assert.match(component, /&& hasStarted/)
  assert.match(route, /getPartyServiceModel/)
  assert.match(route, /getPartyStaffModel/)
  assert.match(route, /servicesById/)
  assert.match(route, /staffById/)
  assert.match(sanitizer, /serviceTitles/)
  assert.match(sanitizer, /performerComment/)
  assert.match(sanitizer, /responsibleStaff/)
  assert.match(sanitizer, /whatsapp/)
  assert.match(sanitizer, /telegram/)
})

test('performer workspace opens read-only order view modal', async () => {
  const component = await source('app/performer/PerformerWorkspaceClient.js')

  assert.match(component, /import Modal from '@components\/Modal'/)
  assert.match(component, /const PerformerOrderViewModal =/)
  assert.match(component, /title="Просмотр заказа"/)
  assert.match(component, /setViewingOrderKey\(orderKey\)/)
  assert.match(component, /Подробнее/)
  assert.match(component, /<DetailSection title="Заказ">/)
  assert.match(component, /<DetailSection title="Клиент">/)
  assert.match(component, /<DetailSection title="Ответственный">/)
  assert.match(component, /<DetailSection title="Участие">/)
  assert.match(component, /order\.performerComment/)
  assert.doesNotMatch(component, /contractAmount/)
  assert.doesNotMatch(component, /clientPayment/)
})

test('performer workspace opens separate report modal after order start', async () => {
  const component = await source('app/performer/PerformerWorkspaceClient.js')

  assert.match(component, /const PerformerReportModal =/)
  assert.match(component, /title="Отчет по заказу"/)
  assert.match(component, /const \[reportOrderKey, setReportOrderKey\]/)
  assert.match(component, /const reportOrder = useMemo/)
  assert.match(component, /setReportOrderKey\(orderKey\)/)
  assert.match(component, /<PerformerReportModal/)
  assert.match(component, /canSubmitReport=\{Boolean\(reportOrderCanSubmitReport\)\}/)
  assert.match(component, /onSaveReport/)
  assert.match(component, /PerformerReportEditor/)
  assert.match(component, /reportOrder && canEditReport\(reportOrder\)/)
  assert.doesNotMatch(component, /confirmationStatus === 'done' \|\|/)
})

test('performer calendar includes performer comment in event description', async () => {
  const helper = await source('helpers/partyPerformerCalendar.js')

  assert.match(helper, /order\.performerComment/)
  assert.match(helper, /Комментарий: \$\{order\.performerComment\}/)
})
