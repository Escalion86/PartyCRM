import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party orders persist and edit additional contacts', async () => {
  const helpers = await source('helpers/partyHelpers.js')
  const schema = await source('schemas/partyOrdersSchema.js')
  const route = await source('app/api/party/orders/route.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const modal = await source('components/party/modals/OrderModal.js')

  assert.match(helpers, /otherContacts:\s*\[\]/)
  assert.match(schema, /partyOrderOtherContactSchema/)
  assert.match(schema, /otherContacts:/)
  assert.match(route, /normalizeOtherContacts/)
  assert.match(route, /otherContacts:\s*normalizeOtherContacts\(body\.otherContacts\)/)
  assert.match(workspace, /otherContacts:\s*Array\.isArray\(order\.otherContacts\)/)
  assert.match(modal, /OtherContactsPicker/)
  assert.match(modal, /handleOtherContactAdd/)
  assert.match(modal, /handleOtherContactSelect/)
})

test('party order modal uses PartyCRM styled additional contacts picker', async () => {
  const modal = await source('components/party/modals/OrderModal.js')
  const picker = await source('components/OtherContactsPicker.js')

  assert.match(modal, /<OtherContactsPicker[\s\S]*tone="party"/)
  assert.match(picker, /tone = 'default'/)
  assert.match(picker, /isPartyTone/)
  assert.match(picker, /border-sky-100 bg-sky-50/)
  assert.match(picker, /Дополнительные контакты еще не добавлены/)
})

test('party order cards show client and additional contacts with contact buttons', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /ContactsIconsButtons/)
  assert.match(component, /const OrderContactLine =/)
  assert.match(component, /const OrderContactsSummary =/)
  assert.match(component, /const OrderContactsPopover =/)
  assert.match(component, /const buildOrderOtherContacts =/)
  assert.match(component, /order\.otherContacts/)
  assert.match(component, /comment \|\| 'Контакт'/)
  assert.match(component, /<OrderContactsSummary/)
  assert.match(component, /\+{otherContacts\.length}/)
  assert.match(component, /aria-label="Показать дополнительные контакты"/)
  assert.match(component, /role="dialog"/)
  assert.match(component, /createPortal\(/)
  assert.match(component, /className="mt-3 flex flex-wrap items-end justify-between gap-2"/)
  assert.match(component, /className="min-w-0 flex-1"/)
  assert.match(component, /showChat/)
  assert.doesNotMatch(component, /Клиент: \{orderClient\.name\} · \{orderClient\.phone\}/)
})

test('party order cards use status color stripe instead of status badge', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /const ORDER_STATUS_STRIPE_CLASSES =/)
  assert.match(component, /border-l-4/)
  assert.match(component, /ORDER_STATUS_STRIPE_CLASSES\[order\.status\]/)
  assert.doesNotMatch(component, /\{statusConfig && \(/)
  assert.doesNotMatch(component, /\{statusConfig\.label\}\s*<\/span>/)
})
