import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPartyVenueConfiguration,
  getPartyVenueLockDays,
  getPartyVenuePeakCapacity,
  getPartyVenueWindow,
  normalizePartyVenueSettings,
  partyVenueId,
} from './partyVenueBooking.js'

test('venue defaults preserve exclusive bookings; buffer input is bounded and cannot cast objects or booleans', () => {
  assert.deepEqual(normalizePartyVenueSettings({}), {
    usageMode: 'exclusive',
    preparationMinutes: 0,
    cleanupMinutes: 0,
  })
  assert.deepEqual(normalizePartyVenueSettings({}, { partial: true }), {})
  for (const value of [-1, 1441, true, {}, [], 'no', 1.5])
    assert.throws(
      () => normalizePartyVenueSettings({ cleanupMinutes: value }),
      { status: 400 }
    )
  for (const id of [
    '',
    'a'.repeat(12),
    { $ne: null },
    ['a'.repeat(24)],
    'g'.repeat(24),
  ])
    assert.throws(() => partyVenueId(id), { status: 400 })
})

test('buffers expand occupancy across midnight and end bounds remain exclusive', () => {
  const window = getPartyVenueWindow(
    { startsAt: '2026-12-01T00:10:00Z', endsAt: '2026-12-01T00:40:00Z' },
    { preparationMinutes: 20, cleanupMinutes: 20 }
  )
  assert.equal(window.occupiedFrom.toISOString(), '2026-11-30T23:50:00.000Z')
  assert.equal(window.occupiedUntil.toISOString(), '2026-12-01T01:00:00.000Z')
  assert.deepEqual(getPartyVenueLockDays(window), ['2026-11-30', '2026-12-01'])
  assert.deepEqual(
    getPartyVenueLockDays(
      getPartyVenueWindow({
        startsAt: '2026-12-01T23:00:00Z',
        endsAt: '2026-12-02T00:00:00Z',
      })
    ),
    ['2026-12-01']
  )
  assert.equal(getPartyVenueWindow({ startsAt: null, endsAt: null }), null)
  assert.throws(
    () => getPartyVenueWindow({ startsAt: 'invalid', endsAt: new Date() }),
    { status: 400 }
  )
  assert.throws(
    () => getPartyVenueWindow({ startsAt: new Date(), endsAt: null }),
    { status: 400 }
  )
})

test('shared capacity uses peak concurrency, not the sum of nonoverlapping sessions', () => {
  const entry = (from, to, capacity) => ({
    occupiedFrom: new Date(from * 1000),
    occupiedUntil: new Date(to * 1000),
    capacity,
  })
  assert.equal(
    getPartyVenuePeakCapacity(entry(0, 100, 10), [
      entry(0, 50, 5),
      entry(50, 100, 6),
    ]),
    16
  )
  assert.equal(
    getPartyVenuePeakCapacity(entry(0, 100, 10), [
      entry(0, 60, 5),
      entry(50, 100, 6),
    ]),
    21
  )
})

test('configuration changes cannot overfill shared sessions or turn overlapping sessions exclusive', () => {
  const entry = (start, end, capacity) => ({
    sourceType: 'ticket_session',
    occupiedFrom: new Date(start),
    occupiedUntil: new Date(end),
    capacity,
  })
  const entries = [entry(0, 100, 6), entry(50, 150, 5)]
  assert.throws(
    () =>
      assertPartyVenueConfiguration({
        entries,
        location: { usageMode: 'shared', capacity: 10 },
      }),
    { status: 409 }
  )
  assert.throws(
    () =>
      assertPartyVenueConfiguration({
        entries,
        location: { usageMode: 'exclusive', capacity: 20 },
      }),
    { status: 409 }
  )
  assert.throws(
    () =>
      assertPartyVenueConfiguration({
        entries,
        location: { usageMode: 'shared', capacity: null },
      }),
    /Укажите вместимость/
  )
  assert.doesNotThrow(() =>
    assertPartyVenueConfiguration({
      entries,
      location: { usageMode: 'shared', capacity: 11 },
    })
  )
})
