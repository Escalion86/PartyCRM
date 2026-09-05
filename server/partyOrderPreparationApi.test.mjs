import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('management preparation API is tenant scoped, optimistic and audited', async () => {
  const route = await source('app/api/party/orders/[id]/preparation/route.js')
  assert.match(route, /managementOnly:\s*true/)
  assert.match(route, /tenantId:\s*context\.tenantId/)
  assert.match(route, /expectedRevision/)
  assert.match(route, /preparation\.revision/)
  assert.match(route, /recordPartyOrderAudit/)
  assert.match(route, /\$nin:\s*\['closed', 'canceled'\]/)
})

test('performer preparation API allows only own item status and address acknowledgement', async () => {
  const route = await source('app/api/party/performer/orders/[id]/preparation/route.js')
  assert.match(route, /excludeLocationOwners:\s*true/)
  assert.match(route, /item\.responsibleStaffId':\s*access\.staffId/)
  assert.match(route, /'assignedStaff\.staffId':\s*access\.staffId/)
  assert.match(route, /set_item_status/)
  assert.match(route, /acknowledge_address/)
  assert.doesNotMatch(route, /managementOnly:\s*true/)
})

test('order list exposes explicit open-preparation filter and location view is read-only', async () => {
  const orders = await source('app/api/party/orders/route.js')
  const location = await source('server/partyLocationWorkspace.js')
  assert.match(orders, /preparationFilter === 'open'/)
  assert.match(orders, /buildPartyOpenPreparationFilter/)
  assert.match(location, /serializePartyOrderPreparation\(order, \{ includeNotes: false \}\)/)
})
