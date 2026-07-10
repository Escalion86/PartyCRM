import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order conversations live in a separate modal opened from the order card', async () => {
  const orderModal = await source('components/party/modals/OrderModal.js')
  const orderMessengerModal = await source(
    'components/party/modals/OrderMessengerModal.js'
  )
  const ordersList = await source('components/party/lists/OrdersList.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const avitoPanel = await source(
    'components/party/integrations/PartyAvitoConversationsPanel.js'
  )
  const vkPanel = await source(
    'components/party/integrations/PartyVkConversationsPanel.js'
  )

  assert.doesNotMatch(orderModal, /PartyVkConversationsPanel/)
  assert.doesNotMatch(orderModal, /PartyAvitoConversationsPanel/)
  assert.doesNotMatch(orderModal, />\s*Переписки\s*</)
  assert.match(orderMessengerModal, /PartyVkConversationsPanel/)
  assert.match(orderMessengerModal, /PartyAvitoConversationsPanel/)
  assert.match(orderMessengerModal, /canReply=\{canManage\}/)
  assert.match(ordersList, /faComments/)
  assert.match(ordersList, /hasConnectedMessengerIntegration/)
  assert.match(ordersList, /integrations\.avitoEnabled === true/)
  assert.match(ordersList, /integrations\.vkGroupEnabled === true/)
  assert.match(ordersList, /vkGroups\.some/)
  assert.match(ordersList, /onMessenger/)
  assert.match(workspace, /OrderMessengerModal/)
  assert.match(workspace, /order-messenger/)
  assert.match(workspace, /companySettings=\{companySettings\}/)
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
