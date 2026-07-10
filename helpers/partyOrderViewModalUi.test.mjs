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
  assert.match(viewModal, /order\?\.performerComment/)
  assert.match(viewModal, /<InfoLine label="Для исполнителя">/)
  assert.match(viewModal, /Финансы/)
  assert.match(viewModal, /Доп\. события/)
})

test('party order view shows contact shortcuts and interactive additional events', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  const additionalEventsModal = await source(
    'components/party/modals/OrderAdditionalEventsModal.js'
  )

  assert.match(viewModal, /ContactsIconsButtons/)
  assert.match(viewModal, /getOrderContacts/)
  assert.match(viewModal, /order\?\.otherContacts/)
  assert.match(viewModal, /Доп\. контакты/)
  assert.match(viewModal, /showChat/)
  assert.match(viewModal, /activeAdditionalEvent/)
  assert.match(viewModal, /openAdditionalEvent/)
  assert.match(viewModal, /toggleAdditionalEventDone/)
  assert.match(additionalEventsModal, /faCircleCheck/)
  assert.match(viewModal, /onUpdateOrder/)
  assert.match(workspace, /onUpdateOrder=\{\(nextOrder\) =>/)
  assert.match(workspace, /setOrderDraft\(normalizeOrderDraft\(updatedOrder\)\)/)
})

test('party order view can edit additional events from card pencil button', async () => {
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  const additionalEventsModal = await source(
    'components/party/modals/OrderAdditionalEventsModal.js'
  )

  assert.match(viewModal, /AdditionalEventCard/)
  assert.match(viewModal, /editingAdditionalEvent/)
  assert.match(viewModal, /openAdditionalEventEditor/)
  assert.match(viewModal, /saveAdditionalEventEdit/)
  assert.match(viewModal, /title="Редактировать доп\. событие"/)
  assert.match(viewModal, /AdditionalEventEditModal/)
  assert.match(additionalEventsModal, /type="datetime-local"/)
  assert.match(viewModal, /editingAdditionalEventDraft\.title/)
  assert.match(viewModal, /editingAdditionalEventDraft\.description/)
})

test('party order view reuses additional events modal cards', async () => {
  const viewModal = await source('components/party/modals/OrderViewModal.js')

  assert.match(
    viewModal,
    /import \{\s*AdditionalEventCard,\s*AdditionalEventEditModal/s
  )
  assert.doesNotMatch(viewModal, /getAdditionalEventStatusClassName/)
  assert.doesNotMatch(viewModal, /faPencilAlt/)
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

test('party order payout status is read-only and payout transaction selects performer', async () => {
  const orderModal = await source('components/party/modals/OrderModal.js')
  const transactions = await source(
    'components/party/orders/PartyOrderTransactionsSection.js'
  )

  assert.match(orderModal, /getPartyAssignmentPayoutState/)
  assert.match(orderModal, /Статус выплаты/)
  assert.doesNotMatch(orderModal, /handlePayoutStatusChange/)
  assert.doesNotMatch(orderModal, /PARTY_ORDER_PAYOUT_STATUSES\.map/)
  assert.match(transactions, /assignedStaff = \[\]/)
  assert.match(transactions, /staffOptions/)
  assert.match(transactions, /draft\.category === 'payout'/)
  assert.match(transactions, /Выберите исполнителя/)
})

test('party order view shows performer confirmation statuses', async () => {
  const viewModal = await source('components/party/modals/OrderViewModal.js')

  assert.match(viewModal, /ASSIGNMENT_STATUS_META/)
  assert.match(viewModal, /getAssignmentSummaryItems/)
  assert.match(viewModal, /confirmationStatus/)
  assert.match(viewModal, /Ждет подтверждения/)
  assert.match(viewModal, /Участие подтверждено/)
  assert.match(viewModal, /Участие отклонено/)
  assert.match(viewModal, /Участие: \{statusMeta\.label\}/)
})
