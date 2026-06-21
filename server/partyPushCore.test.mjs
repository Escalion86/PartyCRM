import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyInviteAcceptedPushPayload,
  buildPartyPerformerAssignmentPushPayload,
  buildPartyPerformerLinkRequestPushPayload,
  buildPartyTestPushPayload,
  normalizePartyPushSubscriptionPayload,
} from './partyPushCore.js'

test('buildPartyInviteAcceptedPushPayload points management to staff list', () => {
  const payload = buildPartyInviteAcceptedPushPayload({
    companyId: 'company-1',
    companyTitle: 'Праздник 24',
    staffId: 'staff-1',
    staffName: 'Петров Иван',
    roleLabel: 'Исполнитель',
  })

  assert.equal(payload.title, 'Праздник 24')
  assert.match(payload.body, /Петров Иван/)
  assert.match(payload.body, /Исполнитель/)
  assert.equal(payload.data.type, 'party_staff_invite_accepted')
  assert.equal(payload.data.companyId, 'company-1')
  assert.equal(payload.data.staffId, 'staff-1')
  assert.equal(payload.data.url, '/company/staff')
})

test('normalizePartyPushSubscriptionPayload accepts browser subscription shape', () => {
  const result = normalizePartyPushSubscriptionPayload({
    endpoint: 'https://push.example.test/abc',
    keys: {
      p256dh: 'p256',
      auth: 'auth',
    },
  })

  assert.deepEqual(result, {
    endpoint: 'https://push.example.test/abc',
    keys: {
      p256dh: 'p256',
      auth: 'auth',
    },
  })
})

test('normalizePartyPushSubscriptionPayload rejects incomplete subscriptions', () => {
  assert.equal(
    normalizePartyPushSubscriptionPayload({
      endpoint: 'https://push.example.test/abc',
      keys: { p256dh: 'p256' },
    }),
    null
  )
})

test('buildPartyTestPushPayload returns company-scoped notification payload', () => {
  const payload = buildPartyTestPushPayload({
    companyId: 'company-1',
    companyTitle: 'Праздник 24',
  })

  assert.equal(payload.title, 'PartyCRM')
  assert.equal(payload.data.type, 'party_test')
  assert.equal(payload.data.companyId, 'company-1')
  assert.equal(payload.data.url, '/company/settings/notifications')
  assert.match(payload.body, /Праздник 24/)
})

test('buildPartyPerformerAssignmentPushPayload returns safe new assignment payload', () => {
  const payload = buildPartyPerformerAssignmentPushPayload({
    companyId: 'company-1',
    companyTitle: 'Праздник 24',
    orderId: 'order-1',
    orderTitle: 'День рождения',
    staffId: 'staff-1',
    eventDate: '2026-06-22T09:00:00.000Z',
    changeType: 'new',
    contractAmount: 30000,
    clientPayment: { totalAmount: 30000 },
    transactions: [{ amount: 30000 }],
  })

  assert.equal(payload.title, 'Праздник 24')
  assert.equal(payload.data.type, 'party_performer_assignment_new')
  assert.equal(payload.data.companyId, 'company-1')
  assert.equal(payload.data.orderId, 'order-1')
  assert.equal(payload.data.staffId, 'staff-1')
  assert.equal(payload.data.url, '/performer')
  assert.match(payload.body, /Новое назначение/)
  assert.match(payload.body, /День рождения/)
  assert.equal(Object.hasOwn(payload.data, 'contractAmount'), false)
  assert.equal(Object.hasOwn(payload.data, 'clientPayment'), false)
  assert.equal(Object.hasOwn(payload.data, 'transactions'), false)
})

test('buildPartyPerformerAssignmentPushPayload returns changed assignment payload', () => {
  const payload = buildPartyPerformerAssignmentPushPayload({
    companyId: 'company-1',
    companyTitle: 'Праздник 24',
    orderId: 'order-1',
    orderTitle: 'День рождения',
    staffId: 'staff-1',
    changeType: 'changed',
  })

  assert.equal(payload.data.type, 'party_performer_assignment_changed')
  assert.match(payload.body, /Назначение изменено/)
  assert.equal(payload.tag, 'party-performer-assignment-changed-order-1-staff-1')
})

test('buildPartyPerformerLinkRequestPushPayload points performer to link requests', () => {
  const payload = buildPartyPerformerLinkRequestPushPayload({
    companyId: 'company-1',
    companyTitle: 'Праздник 24',
    staffId: 'staff-1',
    staffName: 'Иван Петров',
  })

  assert.equal(payload.title, 'Праздник 24')
  assert.equal(payload.data.type, 'party_performer_link_request')
  assert.equal(payload.data.companyId, 'company-1')
  assert.equal(payload.data.staffId, 'staff-1')
  assert.equal(payload.data.url, '/performer')
  assert.match(payload.body, /Иван Петров/)
  assert.match(payload.body, /привязку/)
})
