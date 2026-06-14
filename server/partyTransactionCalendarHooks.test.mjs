import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readRoute = (relativePath) =>
  readFile(new URL(`../app/api/party/transactions/${relativePath}`, import.meta.url), 'utf8')

test('transaction POST syncs its tenant order after create', async () => {
  const source = await readRoute('route.js')
  const createIndex = source.indexOf('PartyTransactions.create')
  const syncIndex = source.indexOf('syncPartyOrderCalendarAfterCrud', createIndex)

  assert.match(source, /orderId:\s*payload\.orderId/)
  assert.ok(createIndex >= 0)
  assert.ok(syncIndex > createIndex)
  assert.match(source.slice(syncIndex), /tenantId:\s*context\.tenantId/)
})

test('transaction PATCH syncs the persisted tenant order after update', async () => {
  const source = await readRoute('[id]/route.js')
  const updateIndex = source.indexOf('PartyTransactions.findOneAndUpdate')
  const syncIndex = source.indexOf('syncPartyOrderCalendarAfterCrud', updateIndex)

  assert.ok(updateIndex >= 0)
  assert.ok(syncIndex > updateIndex)
  assert.match(source.slice(syncIndex), /orderId:\s*String\(transaction\.orderId\)/)
  assert.match(source.slice(syncIndex), /tenantId:\s*context\.tenantId/)
})

test('transaction DELETE keeps deleted orderId and syncs it after delete', async () => {
  const source = await readRoute('[id]/route.js')
  const deleteIndex = source.indexOf('PartyTransactions.findOneAndDelete')
  const syncIndex = source.indexOf('syncPartyOrderCalendarAfterCrud', deleteIndex)

  assert.ok(deleteIndex >= 0)
  assert.ok(syncIndex > deleteIndex)
  assert.match(source.slice(syncIndex), /orderId:\s*String\(transaction\.orderId\)/)
  assert.match(source.slice(syncIndex), /tenantId:\s*context\.tenantId/)
})
