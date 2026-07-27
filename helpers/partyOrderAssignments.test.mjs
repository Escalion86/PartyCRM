import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPartyAssignmentConfirmationDefaults,
  getInitialPartyAssignmentConfirmationStatus,
  preservePartyAssignmentConfirmationStatuses,
} from './partyOrderAssignments.js'

test('unregistered performer assignment is confirmed automatically', () => {
  const staff = { _id: 'staff-external', authUserId: '', linkedAuthUserId: '' }

  assert.equal(getInitialPartyAssignmentConfirmationStatus(staff), 'confirmed')
  assert.deepEqual(
    applyPartyAssignmentConfirmationDefaults({
      assignedStaff: [
        { staffId: 'staff-external', confirmationStatus: 'pending' },
      ],
      staff: [staff],
    }),
    [{ staffId: 'staff-external', confirmationStatus: 'confirmed' }]
  )
})

test('registered performer keeps pending or confirmed status on order edits', () => {
  const staff = { _id: 'staff-linked', authUserId: 'user-1' }

  assert.equal(getInitialPartyAssignmentConfirmationStatus(staff), 'pending')
  assert.deepEqual(
    applyPartyAssignmentConfirmationDefaults({
      assignedStaff: [
        { staffId: 'staff-linked', confirmationStatus: 'confirmed' },
      ],
      staff: [staff],
    }),
    [{ staffId: 'staff-linked', confirmationStatus: 'confirmed' }]
  )
})

test('completed external assignment is not downgraded on order edits', () => {
  assert.deepEqual(
    applyPartyAssignmentConfirmationDefaults({
      assignedStaff: [
        { staffId: 'staff-external', confirmationStatus: 'done' },
      ],
      staff: [{ _id: 'staff-external' }],
    }),
    [{ staffId: 'staff-external', confirmationStatus: 'done' }]
  )
})

test('order edit preserves registered performer confirmation when field is omitted', () => {
  assert.deepEqual(
    preservePartyAssignmentConfirmationStatuses({
      assignedStaff: [{ staffId: 'staff-linked', payoutAmount: 7000 }],
      previousAssignedStaff: [
        { staffId: 'staff-linked', confirmationStatus: 'confirmed' },
      ],
    }),
    [
      {
        staffId: 'staff-linked',
        payoutAmount: 7000,
        confirmationStatus: 'confirmed',
      },
    ]
  )
})
