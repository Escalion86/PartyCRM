import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectPartyPerformerAssignmentPushTargets,
  getPartyStaffPushUserId,
} from './partyPerformerPushCore.js'

test('getPartyStaffPushUserId prefers authUserId and falls back to linkedAuthUserId', () => {
  assert.equal(
    getPartyStaffPushUserId({
      authUserId: 'user-auth',
      linkedAuthUserId: 'user-linked',
    }),
    'user-auth'
  )
  assert.equal(
    getPartyStaffPushUserId({
      authUserId: '',
      linkedAuthUserId: 'user-linked',
    }),
    'user-linked'
  )
})

test('collectPartyPerformerAssignmentPushTargets notifies linked staff for new order', () => {
  const result = collectPartyPerformerAssignmentPushTargets({
    previousOrder: null,
    nextOrder: {
      _id: 'order-1',
      assignedStaff: [{ staffId: 'staff-1' }, { staffId: 'staff-2' }],
    },
    staffById: new Map([
      ['staff-1', { _id: 'staff-1', authUserId: 'user-1' }],
      ['staff-2', { _id: 'staff-2', authUserId: '' }],
    ]),
  })

  assert.deepEqual(result, [
    {
      staffId: 'staff-1',
      userId: 'user-1',
      changeType: 'new',
    },
  ])
})

test('collectPartyPerformerAssignmentPushTargets notifies existing staff when schedule changes', () => {
  const result = collectPartyPerformerAssignmentPushTargets({
    previousOrder: {
      _id: 'order-1',
      eventDate: '2026-06-22T09:00:00.000Z',
      assignedStaff: [{ staffId: 'staff-1', role: 'performer' }],
    },
    nextOrder: {
      _id: 'order-1',
      eventDate: '2026-06-22T10:00:00.000Z',
      assignedStaff: [{ staffId: 'staff-1', role: 'performer' }],
    },
    staffById: new Map([['staff-1', { _id: 'staff-1', authUserId: 'user-1' }]]),
  })

  assert.deepEqual(result, [
    {
      staffId: 'staff-1',
      userId: 'user-1',
      changeType: 'changed',
    },
  ])
})

test('collectPartyPerformerAssignmentPushTargets notifies newly added staff on update', () => {
  const result = collectPartyPerformerAssignmentPushTargets({
    previousOrder: {
      _id: 'order-1',
      assignedStaff: [{ staffId: 'staff-1' }],
    },
    nextOrder: {
      _id: 'order-1',
      assignedStaff: [{ staffId: 'staff-1' }, { staffId: 'staff-2' }],
    },
    staffById: new Map([
      ['staff-1', { _id: 'staff-1', authUserId: 'user-1' }],
      ['staff-2', { _id: 'staff-2', linkedAuthUserId: 'user-2' }],
    ]),
  })

  assert.deepEqual(result, [
    {
      staffId: 'staff-2',
      userId: 'user-2',
      changeType: 'new',
    },
  ])
})

test('collectPartyPerformerAssignmentPushTargets ignores company-only finance changes', () => {
  const result = collectPartyPerformerAssignmentPushTargets({
    previousOrder: {
      _id: 'order-1',
      contractAmount: 10000,
      assignedStaff: [{ staffId: 'staff-1', role: 'performer' }],
    },
    nextOrder: {
      _id: 'order-1',
      contractAmount: 12000,
      clientPayment: { totalAmount: 12000 },
      transactions: [{ amount: 12000 }],
      assignedStaff: [{ staffId: 'staff-1', role: 'performer' }],
    },
    staffById: new Map([['staff-1', { _id: 'staff-1', authUserId: 'user-1' }]]),
  })

  assert.deepEqual(result, [])
})

test('performer comment edit sends changed notification without resetting confirmation', () => {
  const confirmedAssignment = {
    staffId: 'staff-1',
    role: 'performer',
    confirmationStatus: 'confirmed',
  }
  const result = collectPartyPerformerAssignmentPushTargets({
    previousOrder: {
      _id: 'order-1',
      performerComment: '',
      assignedStaff: [confirmedAssignment],
    },
    nextOrder: {
      _id: 'order-1',
      performerComment: 'Вход со двора',
      assignedStaff: [confirmedAssignment],
    },
    staffById: new Map([['staff-1', { _id: 'staff-1', authUserId: 'user-1' }]]),
  })

  assert.equal(confirmedAssignment.confirmationStatus, 'confirmed')
  assert.deepEqual(result, [
    { staffId: 'staff-1', userId: 'user-1', changeType: 'changed' },
  ])
})
