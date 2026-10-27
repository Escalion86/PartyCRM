import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartyRoleOrderPatch,
  createPartyRoleOrderDraft,
} from './partyRoleOrderForm.js'

const context = (permissions) => ({
  tenantId: 'company',
  role: 'performer',
  staff: {
    _id: 'staff',
    tenantId: 'company',
    role: 'performer',
    status: 'active',
    positionId: 'position',
  },
  position: {
    _id: 'position',
    tenantId: 'company',
    active: true,
    permissions,
    orderScope: { assignedOnly: true },
  },
})

test('opening an existing order with seconds or milliseconds does not create a spurious date change', () => {
  const order = {
    eventDate: '2026-10-27T03:04:05.123Z',
    dateEnd: '2026-10-27T04:04:05.123Z',
    title: 'Заказ',
  }
  const actor = context({
    'orders.eventDate': 'edit',
    'orders.dateEnd': 'edit',
    'orders.title': 'read',
  })
  assert.deepEqual(
    buildPartyRoleOrderPatch({
      order,
      draft: createPartyRoleOrderDraft(order),
      context: actor,
    }),
    { patch: {}, forbiddenFields: [], dirty: false }
  )
})

test('manager patches only the changed permitted field and never sends hidden order data', () => {
  const order = {
    title: 'Заявка',
    eventDate: '2026-10-27T03:00:00Z',
    internalNotes: 'secret',
    contractAmount: 12345,
  }
  const draft = createPartyRoleOrderDraft(order)
  draft.title = 'Уточнённый заказ'
  const result = buildPartyRoleOrderPatch({
    order,
    draft,
    context: context({ 'orders.title': 'edit', 'orders.eventDate': 'read' }),
  })
  assert.deepEqual(result.patch, { title: 'Уточнённый заказ' })
  assert.equal(JSON.stringify(result.patch).includes('secret'), false)
})

test('stale draft cannot write a field after its edit permission is revoked', () => {
  const result = buildPartyRoleOrderPatch({
    order: { title: 'Заказ' },
    draft: { title: 'Изменение' },
    context: context({ 'orders.title': 'read' }),
  })
  assert.deepEqual(result.patch, {})
  assert.deepEqual(result.forbiddenFields, ['title'])
})

test('team editing without payroll permission preserves salary by omitting payout fields from PATCH', () => {
  const order = {
    assignedStaff: [
      {
        staffId: 'one',
        role: 'performer',
        confirmationStatus: 'confirmed',
        report: { secret: true },
        payoutAmount: 1500,
      },
    ],
  }
  const draft = createPartyRoleOrderDraft(order)
  draft.assignedStaff[0].role = 'assistant'
  const result = buildPartyRoleOrderPatch({
    order,
    draft,
    context: context({ 'orders.assignedStaff': 'edit' }),
  })
  assert.deepEqual(result.patch.assignedStaff, [
    { staffId: 'one', role: 'assistant' },
  ])
  assert.deepEqual(result.forbiddenFields, [])
})

test('a staff member can be added without granting access to payroll', () => {
  const result = buildPartyRoleOrderPatch({
    order: { assignedStaff: [] },
    draft: { assignedStaff: [{ staffId: 'one', role: 'performer' }] },
    context: context({ 'orders.assignedStaff': 'edit' }),
  })
  assert.deepEqual(result.patch.assignedStaff, [
    { staffId: 'one', role: 'performer' },
  ])
  assert.deepEqual(result.forbiddenFields, [])
})

test('payroll editor may change pay without changing the team and cannot smuggle a new assignment', () => {
  const actor = context({
    'orders.assignedStaff': 'read',
    'finance.payouts': 'edit',
  })
  const order = {
    assignedStaff: [
      {
        staffId: 'one',
        role: 'performer',
        payoutAmount: 1500,
        payoutStatus: 'planned',
      },
    ],
  }
  const draft = createPartyRoleOrderDraft(order)
  draft.assignedStaff[0].payoutAmount = 1750.5
  assert.equal(
    buildPartyRoleOrderPatch({ order, draft, context: actor }).patch
      .assignedStaff[0].payoutAmount,
    1750.5
  )
  draft.assignedStaff.push({ staffId: 'two', role: 'performer' })
  assert.deepEqual(
    buildPartyRoleOrderPatch({ order, draft, context: actor }).forbiddenFields,
    ['assignedStaff']
  )
})

test('read access to a masked order does not require exposing hidden scope fields back into the form', () => {
  const actor = context({ 'orders.performerComment': 'edit' })
  const result = buildPartyRoleOrderPatch({
    order: { performerComment: 'До' },
    draft: { performerComment: 'После' },
    context: actor,
  })
  assert.deepEqual(result.patch, { performerComment: 'После' })
})
