import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('company owner can create location service client unlinked staff and order', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const locationsRoute = await source('app/api/party/locations/route.js')
  const servicesRoute = await source('app/api/party/services/route.js')
  const clientsRoute = await source('app/api/party/clients/route.js')
  const staffRoute = await source('app/api/party/staff/route.js')
  const ordersRoute = await source('app/api/party/orders/route.js')

  for (const route of [
    locationsRoute,
    servicesRoute,
    clientsRoute,
    staffRoute,
    ordersRoute,
  ]) {
    assert.match(route, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
    assert.match(route, /tenantId:\s*context\.tenantId/)
    assert.match(route, /status:\s*201/)
  }

  assert.match(staffRoute, /Для подрядчика без аккаунта укажите имя и телефон/)
  assert.match(staffRoute, /linkStatus:\s*\[\s*'unlinked'/)
  assert.match(ordersRoute, /validateOrderReferences/)
  assert.match(ordersRoute, /findPartyOrderConflicts/)
  assert.match(ordersRoute, /PartyOrders\.create\(\{/)
  assert.match(ordersRoute, /syncPartyOrderCalendarAfterCrud/)

  assert.match(workspace, /const addLocation = useCallback/)
  assert.match(workspace, /const addService = useCallback/)
  assert.match(workspace, /const addClient = useCallback/)
  assert.match(workspace, /const addStaff = useCallback/)
  assert.match(workspace, /const addOrder = useCallback/)
  assert.match(workspace, /setActiveModal\('location'\)/)
  assert.match(workspace, /setActiveModal\('service'\)/)
  assert.match(workspace, /setActiveModal\('client'\)/)
  assert.match(workspace, /setActiveModal\('staff'\)/)
  assert.match(workspace, /setActiveModal\('order'\)/)
})
