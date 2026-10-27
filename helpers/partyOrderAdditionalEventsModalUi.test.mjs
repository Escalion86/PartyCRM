import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order tasks modal opens the canonical task list with its order and company', async () => {
  const component = await source(
    'components/party/modals/OrderAdditionalEventsModal.js'
  )

  const live = component.slice(component.indexOf('export default function OrderAdditionalEventsModal'))
  assert.match(live, /title="Задачи"/)
  assert.match(live, /<PartyTasks/)
  assert.match(live, /companyId=\{activeCompanyId/)
  assert.match(live, /orderId=\{String\(order\._id\)\}/)
  assert.match(live, /hasUnsavedChanges=\{dirty\}/)
  assert.doesNotMatch(live, /AdditionalEventCard|AdditionalEventEditModal/)
})

test('company workspace opens order additional events modal from selected card', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(
    workspace,
    /import OrderAdditionalEventsModal from '@components\/party\/modals\/OrderAdditionalEventsModal'/
  )
  assert.match(workspace, /activeModal === 'order-additional-events'/)
  assert.match(workspace, /onAdditionalEvents=\{\(order\) =>/)
  assert.match(workspace, /onUpdateOrder=\{\(nextOrder\) =>/)
})

test('saved order editor uses canonical tasks and unsaved draft keeps initial task notes', async () => {
  const orderModal = await source('components/party/modals/OrderModal.js')

  assert.match(orderModal, /<TabPanel tabName="Задачи">/)
  assert.match(orderModal, /orderDraft\._id \? <PartyTasks/)
  assert.match(orderModal, /orderId=\{String\(orderDraft\._id\)\}/)
  assert.match(orderModal, /После сохранения заказа будут доступны назначения сотрудникам и должности/)
})

test('canonical tasks support a person, a position and no order association', async () => {
  const tasks = await source('components/party/tasks/PartyTasks.js')
  assert.match(tasks, /orderId = null/)
  assert.match(tasks, /assigneeStaffIds/)
  assert.match(tasks, /assigneeRoleId/)
  assert.match(tasks, /emptyDraft\(data\.currentStaffId, orderId\)/)
})
