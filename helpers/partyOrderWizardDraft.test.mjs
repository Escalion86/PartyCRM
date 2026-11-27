import test from 'node:test'
import assert from 'node:assert/strict'
import { getPartyOrderWizardDraftScope, encodePartyOrderWizardDraft, decodePartyOrderWizardDraft } from './partyOrderWizardDraft.js'
import { PARTY_ORDER_WIZARD_STEP as STEP } from './partyOrderWizardSteps.js'

const now = Date.now()
const context = { tenantId: 'company-a', role: 'admin', staff: { _id: 'staff-a' }, position: { _id: 'position-a', permissions: { orders: 'edit' } } }
const scope = getPartyOrderWizardDraftScope(context)
const snapshot = () => ({
  draft: { orderTypeId: '', locationId: '', customAddress: '', eventDate: '', clientId: '', adminComment: 'Позвонить клиенту', placeType: 'client_address', serviceSelections: [], eventBrief: {}, discount: { type: 'amount', value: 0 }, rental: null },
  step: -1, reachedStep: -1, rentalMinutes: 60,
  expectations: [], initialPayment: { amount: '', paymentMethod: 'transfer' },
  attempt: null,
})
const legacyDraft = (value) => JSON.stringify({
  version: 1,
  key: 'partycrm:order-wizard:1:company-a:staff-a:new',
  signature: scope.signature,
  savedAt: now,
  value,
})

test('a contact lead is recoverable without a type, address or event date', () => {
  const value = snapshot()
  assert.deepEqual(decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now), value)
})

test('unfinished service choices survive reload and malformed option IDs are rejected', () => {
  const value = snapshot()
  value.step = value.reachedStep = STEP.services
  value.draft.serviceSelections = [
    { serviceId: 'fixed', quantity: 1 },
    { serviceId: 'configured', quantity: 1, parameters: { participants: '', addonIds: ['props'], optionIds: { format: 'large' } } },
  ]
  const restore = () => decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now)
  assert.deepEqual(restore(), value)
  value.draft.serviceSelections[1].parameters.optionIds.format = { id: 'large' }
  assert.equal(restore(), null)
})

test('a custom service draft restores incomplete numbers and multiple selected options', () => {
  const value = snapshot()
  value.step = value.reachedStep = STEP.services
  const values = { sets: '2.5', time: '', format: 'extended', extras: ['photo', 'light'] }
  value.draft.serviceSelections = [{ serviceId: 'custom', quantity: 1, parameters: { values } }]
  const restore = () => decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now)
  assert.deepEqual(restore(), value)
  values.extras.push({ id: 'broken' })
  assert.equal(restore(), null)
  values.extras.pop()
  values['invalid field ID'] = 5
  assert.equal(restore(), null)
})

test('a multiple-venue draft restores separate selections and unfinished times', () => {
  const value = snapshot()
  const room = { guestCount: '', eventDate: '', rental: null, rentalMinutes: null, parameters: {} }
  value.draft.placeType = 'company_location'
  value.draft.places = [
    { ...room, id: 'room-a', locationId: 'location-a', guestCount: '12', parameters: { hourlyRate: { values: { tariff: 'morning' } } },
      serviceSelections: [{ lineId: 'line-a', serviceId: 'game', quantity: 1, parameters: { values: { guests: '12' } } }] },
    { ...room, id: 'room-b', locationId: 'location-b', rentalMinutes: '',
      serviceSelections: [{ lineId: 'line-b', serviceId: 'game', quantity: 2, parameters: { values: { guests: '24' } } }] },
  ]
  const restore = () => decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now)
  assert.deepEqual(restore(), value)
  value.draft.places[1].serviceSelections[0].lineId = ''
  assert.equal(restore(), null)
})

test('client creation preserves the editable name line and legacy drafts are still recoverable', () => {
  const value = snapshot()
  value.clientForm = { open: true, draft: { firstName: 'Анна', secondName: 'Иванова', thirdName: '', phone: null, email: '' } }
  assert.deepEqual(decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now).clientForm, value.clientForm)
  value.clientForm.fullName = 'Иванова Анна Сергеевна '
  assert.deepEqual(decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now).clientForm, value.clientForm)
})

test('v1 booking navigation resumes on the equivalent step and keeps reached steps', () => {
  const destinations = [STEP.type, STEP.place, STEP.services, STEP.time, STEP.brief, STEP.finance]
  for (const [index, step] of destinations.entries()) {
    const value = snapshot()
    value.step = index
    value.reachedStep = 5
    value.draft.clientId = 'client-a'
    assert.deepEqual(
      decodePartyOrderWizardDraft(scope, legacyDraft(value), now),
      { ...value, step, reachedStep: STEP.finance }
    )
  }
})

test('v1 combined step resumes client selection if a client is missing or being created', () => {
  const value = snapshot()
  value.step = value.reachedStep = 4
  assert.deepEqual(
    decodePartyOrderWizardDraft(scope, legacyDraft(value), now),
    { ...value, step: STEP.client, reachedStep: STEP.brief }
  )
  value.draft.clientId = 'client-a'
  value.clientForm = {
    open: true,
    draft: { firstName: '', secondName: '', thirdName: '', phone: 79000000123, email: '' },
    fullName: 'Иванова Анна ',
  }
  assert.deepEqual(
    decodePartyOrderWizardDraft(scope, legacyDraft(value), now),
    { ...value, step: STEP.client, reachedStep: STEP.brief }
  )
})

test('draft storage is isolated by company, employee and order', () => {
  assert.notEqual(scope.key, getPartyOrderWizardDraftScope({ ...context, tenantId: 'company-b' }).key)
  assert.notEqual(scope.key, getPartyOrderWizardDraftScope({ ...context, staff: { _id: 'staff-b' } }).key)
  assert.notEqual(scope.key, getPartyOrderWizardDraftScope(context, { _id: 'order-a' }).key)
  const inboxScope = getPartyOrderWizardDraftScope(context, {}, 'vk:one')
  assert.notEqual(scope.key, inboxScope.key)
  assert.notEqual(inboxScope.key, getPartyOrderWizardDraftScope(context, {}, 'vk:two').key)
  assert.equal(decodePartyOrderWizardDraft(getPartyOrderWizardDraftScope({ ...context, tenantId: 'company-b' }), encodePartyOrderWizardDraft(scope, snapshot(), now), now), null)
  assert.equal(getPartyOrderWizardDraftScope({ tenantId: 'company-a' }), null)
})

test('changed permissions, order scope or a newer saved order invalidate the draft', () => {
  const encoded = encodePartyOrderWizardDraft(scope, snapshot(), now)
  for (const changed of [
    getPartyOrderWizardDraftScope({ ...context, position: { ...context.position, permissions: { orders: 'read' } } }),
    getPartyOrderWizardDraftScope({ ...context, position: { ...context.position, orderScope: { assignedOnly: true } } }),
    getPartyOrderWizardDraftScope(context, { commercialRevision: 2 }),
  ]) assert.equal(decodePartyOrderWizardDraft(changed, encoded, now), null)
})

test('expired, future, oversized and corrupted storage is ignored', () => {
  const encoded = encodePartyOrderWizardDraft(scope, snapshot(), now)
  assert.equal(decodePartyOrderWizardDraft(scope, encoded, now + 86400001), null)
  assert.equal(decodePartyOrderWizardDraft(scope, encoded, now - 1), null)
  for (const value of ['{', 'null', '[]', 'x'.repeat(200001)]) assert.equal(decodePartyOrderWizardDraft(scope, value, now), null)
  const invalid = snapshot()
  invalid.draft.customAddress = null
  assert.equal(decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, invalid, now), now), null)
})

test('interrupted create preserves its original operation and payment payload', () => {
  const value = snapshot()
  value.step = value.reachedStep = STEP.finance
  value.initialPayment.amount = '500'
  value.attempt = { key: 'original-operation', body: { bookingVersion: 1, clientId: 'client-a', initialPayment: { amount: '500', paymentMethod: 'transfer' } } }
  value.unresolved = true
  const restored = decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now)
  assert.deepEqual(restored.attempt, value.attempt)
  assert.equal(restored.unresolved, true)
  const legacyValue = { ...value, step: 5, reachedStep: 5, pending: true }
  assert.deepEqual(
    decodePartyOrderWizardDraft(scope, legacyDraft(legacyValue), now),
    { ...value, pending: true }
  )
})
