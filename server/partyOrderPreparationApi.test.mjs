import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('position-granted preparation API is tenant scoped, optimistic and audited', async () => {
  const route = await source('app/api/party/orders/[id]/preparation/route.js')
  assert.doesNotMatch(route, /managementOnly:\s*true/)
  assert.match(route, /allowLocationOwner:\s*true/)
  assert.match(route, /resource:\s*'orders.preparation',\s*action:\s*'edit'/)
  assert.match(route, /getPartyOrderWriteGuard\(current\)/)
  assert.match(route, /buildPartyOrderAccessFilter\(context\)/)
  assert.match(route, /tenantId:\s*context\.tenantId/)
  assert.match(route, /expectedRevision/)
  assert.match(route, /preparation\.revision/)
  assert.match(route, /recordPartyOrderAudit/)
  assert.match(route, /\$nin:\s*\['closed', 'canceled'\]/)
})

test('performer preparation API redirects checklist changes to tasks and guards own address acknowledgement', async () => {
  const route = await source('app/api/party/performer/orders/[id]/preparation/route.js')
  assert.match(route, /excludeLocationOwners:\s*true/)
  assert.match(route, /partycrm_preparation_tasks_managed/)
  assert.doesNotMatch(route, /'preparation\.items\.\$\[item\]\.status'/)
  assert.match(route, /'assignedStaff\.staffId':\s*access\.staffId/)
  assert.match(route, /set_item_status/)
  assert.match(route, /acknowledge_address/)
  assert.match(route, /getPartyOrderWriteGuard\(current\)/)
  assert.match(route, /resource:\s*'orders.preparation'/)
  assert.doesNotMatch(route, /managementOnly:\s*true/)
})

test('order list exposes explicit open-preparation filter and location view is read-only', async () => {
  const orders = await source('app/api/party/orders/route.js')
  const location = await source('server/partyLocationWorkspace.js')
  assert.match(orders, /preparationFilter === 'open'/)
  assert.match(orders, /buildPartyOpenPreparationFilter/)
  assert.match(location, /serializePartyOrderPreparation\(order, \{ includeNotes: false \}\)/)
})
