import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findPartyOrderConflicts,
  hasPartyOrderConflicts,
} from './partyOrderConflicts.js'

const createQuery = (items) => ({
  select() {
    return this
  },
  lean() {
    return Promise.resolve(items)
  },
})

test('findPartyOrderConflicts detects overlapping location and staff bookings', async () => {
  const calls = []
  const PartyOrders = {
    find(query) {
      calls.push(query)
      if (query.locationId) {
        return createQuery([{ _id: 'location-conflict' }])
      }
      if (query['assignedStaff.staffId']) {
        return createQuery([{ _id: 'staff-conflict' }])
      }
      return createQuery([])
    },
  }

  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: 'company-1',
    payload: {
      eventDate: new Date('2026-07-01T10:00:00.000Z'),
      dateEnd: new Date('2026-07-01T12:00:00.000Z'),
      placeType: 'company_location',
      locationId: 'location-1',
      assignedStaff: [{ staffId: 'staff-1' }],
    },
    excludeOrderId: 'order-1',
  })

  assert.equal(hasPartyOrderConflicts(conflicts), true)
  assert.deepEqual(conflicts.locationConflicts, [{ _id: 'location-conflict' }])
  assert.deepEqual(conflicts.staffConflicts, [{ _id: 'staff-conflict' }])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].tenantId, 'company-1')
  assert.deepEqual(calls[0].status, { $nin: ['canceled', 'closed'] })
  assert.deepEqual(calls[0]._id, { $ne: 'order-1' })
  assert.equal(calls[0].locationId, 'location-1')
  assert.deepEqual(calls[1]['assignedStaff.staffId'], { $in: ['staff-1'] })
})

test('findPartyOrderConflicts skips checks without a complete date range', async () => {
  const PartyOrders = {
    find() {
      throw new Error('find should not be called without dates')
    },
  }

  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: 'company-1',
    payload: { placeType: 'company_location', locationId: 'location-1' },
  })

  assert.deepEqual(conflicts, {
    locationConflicts: [],
    staffConflicts: [],
  })
  assert.equal(hasPartyOrderConflicts(conflicts), false)
})
