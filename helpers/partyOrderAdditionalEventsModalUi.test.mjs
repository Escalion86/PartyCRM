import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order additional events modal mirrors ArtistCRM list flow', async () => {
  const component = await source(
    'components/party/modals/OrderAdditionalEventsModal.js'
  )

  assert.match(component, /title="Доп\. события"/)
  assert.match(component, /Всего: \{additionalEvents\.length\}/)
  assert.match(component, /Создать доп\. событие/)
  assert.match(component, /getAdditionalEventsDisplayGroups/)
  assert.match(component, /openAdditionalEvent/)
  assert.match(component, /toggleAdditionalEventDone/)
  assert.match(component, /Редактировать доп\. событие/)
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

test('order editor uses additional event cards and create modal', async () => {
  const orderModal = await source('components/party/modals/OrderModal.js')

  assert.match(orderModal, /AdditionalEventCard/)
  assert.match(orderModal, /AdditionalEventEditModal/)
  assert.match(orderModal, /createAdditionalEvent/)
  assert.match(orderModal, /editingAdditionalEvent === -1/)
  assert.doesNotMatch(orderModal, /handleAddAdditionalEvent/)
})
