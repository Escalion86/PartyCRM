import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party performer reports are stored on assigned staff and sanitized for performer', async () => {
  const schema = await source('schemas/partyOrdersSchema.js')
  const sanitizer = await source('helpers/partyPerformerOrders.js')

  assert.match(schema, /partyPerformerReportSchema/)
  assert.match(schema, /report:\s*\{\s*type:\s*partyPerformerReportSchema/)
  assert.match(schema, /revision_requested/)
  assert.match(schema, /files:\s*\{/)
  assert.match(sanitizer, /report:\s*assignment\.report/)
})

test('performer can submit report through own assignment endpoint', async () => {
  const route = await source('app/api/party/performer/orders/[id]/report/route.js')
  const helper = await source('server/partyPerformerReports.js')

  assert.match(route, /getPartyMembershipContext/)
  assert.match(route, /staffId/)
  assert.match(route, /assignedStaff\.staffId/)
  assert.match(route, /assignedStaff\.\$\.report/)
  assert.match(helper, /submittedAt/)
})

test('owner admin can review performer report from company endpoint', async () => {
  const route = await source('app/api/party/orders/[id]/reports/[staffId]/route.js')
  const helper = await source('server/partyPerformerReports.js')

  assert.match(route, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(route, /tenantId:\s*context\.tenantId/)
  assert.match(helper, /accepted/)
  assert.match(helper, /revision_requested/)
  assert.match(route, /reviewComment/)
})

test('performer and company UIs expose performer reports', async () => {
  const performer = await source('app/performer/PerformerWorkspaceClient.js')
  const orderView = await source('components/party/modals/OrderViewModal.js')
  const ordersList = await source('components/party/lists/OrdersList.js')

  assert.match(performer, /Отчет по заказу/)
  assert.match(performer, /savePerformerReport/)
  assert.match(performer, /reportDrafts/)
  assert.match(orderView, /Отчеты исполнителей/)
  assert.match(orderView, /onReviewReport/)
  assert.match(ordersList, /Ждет отчет/)
  assert.match(ordersList, /Отчет на проверке/)
})
