import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order click opens a read-only order view modal', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const list = await source('components/party/lists/OrdersList.js')
  const viewModal = await source('components/party/modals/OrderViewModal.js')

  assert.match(workspace, /import OrderViewModal/)
  assert.match(workspace, /activeModal === 'order-view'/)
  assert.match(workspace, /<OrderViewModal/)
  assert.match(workspace, /onView=\{\(order\) =>/)
  assert.match(list, /onView/)
  assert.match(list, /<PartyCard onClick=\{\(\) => onView\?\.\(order\)\}/)
  assert.match(viewModal, /title="Просмотр заказа"/)
  assert.match(viewModal, /Редактировать/)
  assert.match(viewModal, /\{order\?\.adminComment \? \(/)
  assert.match(viewModal, /<InfoLine label="Комментарий">\{order\.adminComment\}<\/InfoLine>/)
  assert.match(viewModal, /Финансы/)
  assert.match(viewModal, /Доп\. события/)
})

test('closed party orders hide edit and transaction controls in UI', async () => {
  const list = await source('components/party/lists/OrdersList.js')
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  const orderModal = await source('components/party/modals/OrderModal.js')
  const transactions = await source(
    'components/party/orders/PartyOrderTransactionsSection.js'
  )

  assert.match(list, /const isClosed = order\.status === 'closed'/)
  assert.match(list, /canManage && !isClosed/)
  assert.match(viewModal, /const isClosed = order\?\.status === 'closed'/)
  assert.match(viewModal, /canManage && !isClosed/)
  assert.match(orderModal, /isClosed=\{orderDraft\.status === 'closed'\}/)
  assert.match(transactions, /isClosed = false/)
  assert.match(transactions, /Закрытый заказ: транзакции доступны только для просмотра/)
  assert.match(transactions, /disabled=\{busy \|\| isClosed\}/)
})
