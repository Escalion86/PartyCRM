import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  partyVenueBookingsSchema,
  partyVenueLocksSchema,
} from './partyVenueBookingsSchema.js'
import partyLocationsSchema from './partyLocationsSchema.js'

const Booking = mongoose.model(
  'VenueBookingSchemaTest',
  new mongoose.Schema(partyVenueBookingsSchema)
)
const Lock = mongoose.model(
  'VenueLockSchemaTest',
  new mongoose.Schema(partyVenueLocksSchema)
)
const Location = mongoose.model(
  'VenueLocationSchemaTest',
  new mongoose.Schema(partyLocationsSchema)
)
const tenantId = 'a'.repeat(24),
  locationId = 'b'.repeat(24),
  sourceId = 'c'.repeat(24)

test('booking schema casts valid IDs and dates without connecting; bad references/status types are rejected', () => {
  const booking = new Booking({
    tenantId,
    locationId,
    sourceId,
    sourceType: 'ticket_session',
    startsAt: '2026-12-01T10:00:00Z',
    endsAt: '2026-12-01T11:00:00Z',
    occupiedFrom: '2026-12-01T09:30:00Z',
    occupiedUntil: '2026-12-01T11:30:00Z',
    capacity: 20,
  })
  assert.equal(booking.validateSync(), undefined)
  assert.ok(booking.tenantId instanceof mongoose.Types.ObjectId)
  assert.ok(booking.startsAt instanceof Date)
  assert.equal(booking.exclusive, true)
  const bad = new Booking({
    ...booking.toObject(),
    tenantId: { $ne: '' },
    sourceType: 'arbitrary',
    startsAt: 'invalid',
    capacity: 0,
  })
  const failure = bad.validateSync()
  for (const field of ['tenantId', 'sourceType', 'startsAt', 'capacity'])
    assert.ok(failure.errors[field])
})

test('location defaults remain exclusive and unmanaged; buffers reject out-of-range values', () => {
  const location = new Location({ tenantId, title: 'Зал' })
  assert.equal(location.validateSync(), undefined)
  assert.equal(location.usageMode, 'exclusive')
  assert.equal(location.venueBookingManaged, false)
  assert.equal(location.preparationMinutes, 0)
  assert.equal(location.cleanupMinutes, 0)
  const bad = new Location({
    tenantId,
    title: 'Зал',
    usageMode: 'unknown',
    preparationMinutes: -1,
    cleanupMinutes: 1441,
  })
  for (const field of ['usageMode', 'preparationMinutes', 'cleanupMinutes'])
    assert.ok(bad.validateSync().errors[field])
  assert.ok(
    new Lock({
      tenantId,
      locationId: 'invalid',
      day: '2026-12-01',
    }).validateSync().errors.locationId
  )
})
