import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('performer workspace exposes calendar export link', async () => {
  const component = await source('app/performer/PerformerWorkspaceClient.js')

  assert.match(component, /\/api\/party\/performer\/calendar/)
  assert.match(component, /Скачать календарь/)
  assert.match(component, /download="partycrm-performer-calendar\.ics"/)
})

test('performer order cards expose contacts, services and guarded done action', async () => {
  const component = await source('app/performer/PerformerWorkspaceClient.js')
  const route = await source('app/api/party/performer/orders/route.js')
  const sanitizer = await source('helpers/partyPerformerOrders.js')

  assert.match(component, /ContactsIconsButtons/)
  assert.match(component, /formatCompanyTitle/)
  assert.match(component, /Компания "\$\{title\}"/)
  assert.match(component, /order\.serviceTitles/)
  assert.match(component, /confirmationStatus === 'confirmed'/)
  assert.match(component, /isOrderStarted\(order\)/)
  assert.match(route, /getPartyServiceModel/)
  assert.match(route, /servicesById/)
  assert.match(sanitizer, /serviceTitles/)
  assert.match(sanitizer, /whatsapp/)
  assert.match(sanitizer, /telegram/)
})
