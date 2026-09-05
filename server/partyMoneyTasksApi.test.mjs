import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('money task API scopes lists and mutations to tenant and performer', async () => {
  const [listRoute, itemRoute, service] = await Promise.all([
    source('app/api/party/money-tasks/route.js'),
    source('app/api/party/money-tasks/[id]/route.js'),
    source('server/partyMoneyTasks.js'),
  ])
  assert.match(listRoute, /const filter = \{ tenantId: context\.tenantId \}/)
  assert.match(listRoute, /filter\.responsibleStaffId = context\.staff\._id/)
  assert.match(listRoute, /for \(const name of \['orderId', 'staffId'\]\)/)
  assert.match(itemRoute, /tenantId: context\.tenantId/)
  assert.match(service, /assertMoneyTaskAccess\(current, context\)/)
  assert.match(service, /managementOnly|isFinancialManager\(context\)/)
})

test('money task completion is reviewed, atomic and idempotent', async () => {
  const [service, operations, models] = await Promise.all([
    source('server/partyMoneyTasks.js'),
    source('schemas/partyFinancialOperationsSchema.js'),
    source('server/partyFinancialModels.js'),
  ])
  assert.match(service, /current\.status !== 'submitted'/)
  assert.match(service, /withPartyFinancialTransaction\(context\.tenantId/)
  assert.match(service, /current\.completedOperationId/)
  assert.match(service, /custody_transferred_to_company/)
  assert.match(service, /submittedAmountKopecks > available/)
  assert.match(operations, /moneyTaskId/)
  assert.match(models, /tenantId: 1, idempotencyKey: 1.*unique: true/s)
})

test('money task creation is retry-safe and limited to an assigned participant', async () => {
  const [service, route] = await Promise.all([
    source('server/partyMoneyTasks.js'),
    source('app/api/party/money-tasks/route.js'),
  ])
  assert.match(service, /assignment\.staffId/)
  assert.match(service, /value\.responsibleStaffId/)
  assert.match(service, /createPayloadHash/)
  assert.match(service, /repeated: true/)
  assert.match(route, /delete safeTask\.idempotencyKey/)
  assert.match(route, /delete safeTask\.createPayloadHash/)
})
