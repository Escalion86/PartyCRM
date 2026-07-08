import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party client similar route is tenant-aware and management-only', async () => {
  const route = await source('app/api/party/clients/similar/route.js')
  const dedupe = await source('server/partyClientDedupe.js')

  assert.match(route, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(route, /tenantId:\s*context\.tenantId/)
  assert.match(route, /findSimilarPartyClients/)
  assert.match(dedupe, /status:\s*\{\s*\$ne:\s*'archived'\s*\}/)
})

test('company client list wires delete action through PartyCRM API', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const list = await source('components/party/lists/ClientsList.js')

  assert.match(workspace, /const deleteClient = useCallback/)
  assert.match(workspace, /\/api\/party\/clients\/\$\{clientId\}/)
  assert.match(workspace, /method:\s*'DELETE'/)
  assert.match(workspace, /setClients\(\(prev\) =>\s*prev\.filter/)
  assert.match(workspace, /<ClientsList[\s\S]*canManage=\{canManage\}[\s\S]*onDelete=\{deleteClient\}/)
  assert.match(list, /tooltipText="Удалить"/)
})

test('party client modal shows similar client warning and can open found client', async () => {
  const modal = await source('components/party/modals/ClientModal.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(modal, /similarClients/)
  assert.match(modal, /Похожий клиент/)
  assert.match(modal, /onSimilarClientSelect/)
  assert.match(workspace, /loadSimilarClients/)
  assert.match(workspace, /\/api\/party\/clients\/similar/)
  assert.match(workspace, /setSimilarClients/)
})
