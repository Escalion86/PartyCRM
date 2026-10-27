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
  assert.match(viewModal, /Исполнители/)
  assert.match(viewModal, /Финансы/)
  assert.match(viewModal, /<Section title="Задачи">/)
})

test('closed party order view keeps performers, fees and performer comment visible', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  const orderRoute = await source('app/api/party/orders/[id]/route.js')

  assert.match(workspace, /\? \{ \.\.\.order, status: 'closed' \}/)
  assert.match(orderRoute, /\$set:\s*\{\s*status: nextStatus/)
  assert.match(orderRoute, /snapshotPartyBriefForClose/)
  assert.match(
    viewModal,
    /const assignedStaff = Array\.isArray\(order\?\.assignedStaff\)/
  )
  assert.match(viewModal, /<Section title="Исполнители">/)
  assert.match(viewModal, /Гонорар:/)
  assert.match(viewModal, /Комментарий исполнителю/)
  assert.match(viewModal, /\{order\.performerComment\}/)
  assert.doesNotMatch(viewModal, /const assignedStaff = isClosed/)
})

test('party order view uses the unified contacts and task list', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  assert.match(viewModal, /<PartyOrderContactRolesView/)
  assert.match(viewModal, /clientsById=\{safeClientsById\}/)
  assert.match(viewModal, /otherContacts=\{order\.otherContacts \|\| \[\]\}/)
  assert.match(viewModal, /<PartyTasks companyId=\{activeCompanyId\}/)
  assert.match(workspace, /onUpdateOrder=\{\(nextOrder\) =>/)
  assert.match(workspace, /setOrderDraft\(normalizeOrderDraft\(updatedOrder\)\)/)
})

test('party order view delegates task actions to the canonical task component', async () => {
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  const block = viewModal.slice(viewModal.indexOf('<Section title="Задачи">'), viewModal.indexOf('</Section>', viewModal.indexOf('<Section title="Задачи">')))
  assert.match(block, /<PartyTasks/)
  assert.match(block, /orderId=\{String\(order\._id\)\}/)
  assert.doesNotMatch(block, /AdditionalEventCard|AdditionalEventEditModal/)
})

test('party order view uses the same task source as the standalone task modal', async () => {
  const viewModal = await source('components/party/modals/OrderViewModal.js')
  const tasksModal = await source('components/party/modals/OrderAdditionalEventsModal.js')
  assert.match(viewModal, /import PartyTasks from '@components\/party\/tasks\/PartyTasks'/)
  assert.match(tasksModal, /import PartyTasks from '@components\/party\/tasks\/PartyTasks'/)
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
