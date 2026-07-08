import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party client delete performs hard delete only after relation check', async () => {
  const route = await source('app/api/party/clients/[id]/route.js')
  const helper = await source('server/partyClientDeleteCheck.js')

  assert.match(route, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(route, /getPartyClientDeleteRelations/)
  assert.match(route, /partycrm_client_delete_blocked/)
  assert.match(route, /findOneAndDelete/)
  assert.match(route, /tenantId:\s*context\.tenantId/)

  assert.match(helper, /getPartyOrderModel/)
  assert.match(helper, /getPartyCallModel/)
  assert.match(helper, /getPartyVkConversationModel/)
  assert.match(helper, /getPartyAvitoConversationModel/)
  assert.match(helper, /hasPartyClientDeleteRelations/)
})

test('company client list exposes delete action and archive fallback', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const list = await source('components/party/lists/ClientsList.js')

  assert.match(workspace, /const deleteClient = useCallback/)
  assert.match(workspace, /method:\s*'DELETE'/)
  assert.match(workspace, /partycrm_client_delete_blocked/)
  assert.match(workspace, /archiveClient\(clientId,\s*true\)/)
  assert.match(workspace, /method:\s*'PATCH'/)
  assert.match(workspace, /status:\s*'archived'/)
  assert.match(workspace, /onDelete=\{deleteClient\}/)
  assert.match(list, /tooltipText="Удалить"/)
})
