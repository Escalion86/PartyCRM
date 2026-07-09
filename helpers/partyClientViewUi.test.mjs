import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party client cards open a reusable client view modal', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const list = await source('components/party/lists/ClientsList.js')
  const modal = await source('components/party/modals/ClientModal.js')

  assert.match(modal, /export function ClientViewModal/)
  assert.match(modal, /title="Просмотр клиента"/)
  assert.match(modal, /ContactsIconsButtons/)
  assert.match(workspace, /ClientFormModal/)
  assert.match(workspace, /ClientViewModal/)
  assert.match(workspace, /activeModal === 'client-view'/)
  assert.match(workspace, /<ClientViewModal/)
  assert.match(workspace, /onView=\{\(client\) =>/)
  assert.match(list, /onView/)
  assert.match(list, /<PartyCard onClick=\{\(\) => onView\?\.\(client\)\}/)
  assert.match(list, /onClick=\{\(\) => onEdit && onEdit\(client\)\}/)
})

test('party order view opens client view modal from main and additional contacts', async () => {
  const viewModal = await source('components/party/modals/OrderViewModal.js')

  assert.match(viewModal, /ClientViewModal/)
  assert.match(viewModal, /viewingClient/)
  assert.match(viewModal, /openClientView/)
  assert.match(viewModal, /onClick=\{\(\) => onView\?\.\(contact\.client\)\}/)
  assert.match(viewModal, /<ClientViewModal/)
})
