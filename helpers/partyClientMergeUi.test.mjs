import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party client merge route transfers tenant-owned relations and archives duplicate', async () => {
  const route = await source('app/api/party/clients/[id]/merge/route.js')

  assert.match(route, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(route, /tenantId:\s*context\.tenantId/)
  assert.match(route, /mergePartyClients/)
  assert.match(route, /sourceClientId/)
})

test('party client merge helper updates core client relations', async () => {
  const helper = await source('server/partyClientMerge.js')

  assert.match(helper, /getPartyOrderModel/)
  assert.match(helper, /getPartyTransactionModel/)
  assert.match(helper, /getPartyCallModel/)
  assert.match(helper, /getPartyVkConversationModel/)
  assert.match(helper, /getPartyVkMessageModel/)
  assert.match(helper, /getPartyAvitoConversationModel/)
  assert.match(helper, /getPartyAvitoMessageModel/)
  assert.match(helper, /status:\s*'archived'/)
  assert.match(helper, /buildPartyClientSnapshot/)
  assert.match(helper, /\$set:\s*\{\s*clientId:\s*targetClientId,\s*client\s*\}/)
})

test('party client modal can request duplicate merge for existing client', async () => {
  const modal = await source('components/party/modals/ClientModal.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(modal, /onMergeSimilarClient/)
  assert.match(modal, /Объединить/)
  assert.match(workspace, /mergeSimilarClient/)
  assert.match(workspace, /\/api\/party\/clients\/\$\{editingClientId\}\/merge/)
})
