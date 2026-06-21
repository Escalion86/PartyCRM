import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party messenger panels expose replies for company managers from order modal', async () => {
  const orderModal = await source('components/party/modals/OrderModal.js')
  const avitoPanel = await source(
    'components/party/integrations/PartyAvitoConversationsPanel.js'
  )
  const vkPanel = await source(
    'components/party/integrations/PartyVkConversationsPanel.js'
  )

  assert.match(orderModal, /canManage/)
  assert.match(orderModal, /canReply=\{canManage\}/)
  assert.match(avitoPanel, /canReply\s*=\s*true/)
  assert.match(avitoPanel, /canReply=\{canReply\}/)
  assert.match(vkPanel, /canReply\s*=\s*true/)
  assert.match(vkPanel, /canReply=\{canReply\}/)
  assert.doesNotMatch(avitoPanel, /canReply=\{false\}/)
  assert.doesNotMatch(vkPanel, /canReply=\{false\}/)
})

test('party client edit modal exposes VK and Avito conversations for the selected client', async () => {
  const clientModal = await source('components/party/modals/ClientModal.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(clientModal, /PartyVkConversationsPanel/)
  assert.match(clientModal, /PartyAvitoConversationsPanel/)
  assert.match(clientModal, /clientId=\{clientDraft\._id \|\| ''\}/)
  assert.match(clientModal, /companyId=\{activeCompanyId\}/)
  assert.match(clientModal, /canReply=\{canManage\}/)
  assert.match(workspace, /activeCompanyId=\{activeCompanyId\}/)
  assert.match(workspace, /canManage=\{canManage\}/)
})
