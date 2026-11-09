import test from 'node:test'
import assert from 'node:assert/strict'
import { getPartyOrderWizardDraftScope, encodePartyOrderWizardDraft, decodePartyOrderWizardDraft } from './partyOrderWizardDraft.js'

const now = Date.now()
const context = { tenantId: 'company-a', role: 'admin', staff: { _id: 'staff-a' }, position: { _id: 'position-a', permissions: { orders: 'edit' } } }
const scope = getPartyOrderWizardDraftScope(context)
const snapshot = () => ({
  draft: { orderTypeId: '', locationId: '', customAddress: '', eventDate: '', clientId: '', adminComment: 'Позвонить клиенту', placeType: 'client_address', serviceSelections: [], eventBrief: {}, discount: { type: 'amount', value: 0 }, rental: null },
  step: -1, reachedStep: -1, rentalMinutes: 60,
  expectations: [], initialPayment: { amount: '', paymentMethod: 'transfer' },
  attempt: null,
})

test('a contact lead is recoverable without a type, address or event date', () => {
  const value = snapshot()
  assert.deepEqual(decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now), value)
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
  value.step = value.reachedStep = 5
  value.initialPayment.amount = '500'
  value.attempt = { key: 'original-operation', body: { bookingVersion: 1, clientId: 'client-a', initialPayment: { amount: '500', paymentMethod: 'transfer' } } }
  value.unresolved = true
  const restored = decodePartyOrderWizardDraft(scope, encodePartyOrderWizardDraft(scope, value, now), now)
  assert.deepEqual(restored.attempt, value.attempt)
  assert.equal(restored.unresolved, true)
})
