import assert from 'node:assert/strict'
import test from 'node:test'
import { getPartyOrderWizardInitialStep } from './partyOrderWizardStart.js'
import { PARTY_ORDER_WIZARD_STEP } from './partyOrderWizardSteps.js'

const locationId = '000000000000000000000001'
const serviceId = '000000000000000000000002'
const venueOrder = {
  _id: '000000000000000000000003',
  status: 'draft',
  orderTypeId: '000000000000000000000004',
  placeType: 'company_location',
  locationId,
  eventDate: '2026-12-01T10:00:00Z',
  dateEnd: '2026-12-01T11:00:00Z',
  clientId: '000000000000000000000005',
}
const offsiteOrder = {
  ...venueOrder,
  placeType: 'client_address',
  locationId: null,
  clientAddress: { town: 'Красноярск', street: 'Мира', house: '1' },
  servicesIds: [serviceId],
}
const getStep = (order, options) => getPartyOrderWizardInitialStep({
  order,
  can: () => true,
  locations: [{ _id: locationId }],
  services: [{ _id: serviceId, duration: 30 }],
  ...options,
})

test('routes to the first missing required step', () => {
  assert.equal(getStep({ ...venueOrder, clientId: null, orderTypeId: null }), PARTY_ORDER_WIZARD_STEP.client)
  assert.equal(getStep({ ...venueOrder, orderTypeId: null, locationId: null }), PARTY_ORDER_WIZARD_STEP.type)
  assert.equal(getStep({ ...venueOrder, locationId: null, eventDate: null }), PARTY_ORDER_WIZARD_STEP.place)
  assert.equal(getStep({ ...venueOrder, eventDate: 'invalid date' }), PARTY_ORDER_WIZARD_STEP.time)
})

test('accepts a legacy rental interval and optional services and payments', () => {
  assert.equal(getStep(venueOrder), null)
  assert.equal(getStep({ ...venueOrder, orderItems: [], clientPayment: null }), null)
  assert.equal(getStep({ ...venueOrder, dateEnd: venueOrder.eventDate }), PARTY_ORDER_WIZARD_STEP.time)
})

test('checks that the venue rental covers the program duration', () => {
  const order = {
    ...venueOrder,
    rental: { startsAt: '2026-12-01T09:45:00Z', endsAt: '2026-12-01T10:45:00Z' },
    orderItems: [{ serviceId, quantity: 1, durationMinutes: 60 }],
  }
  assert.equal(getStep(order), PARTY_ORDER_WIZARD_STEP.time)
  assert.equal(getStep({
    ...order,
    rental: { ...order.rental, endsAt: '2026-12-01T11:00:00Z' },
  }), null)
})

test('parallel venue programs are checked against their own windows', () => {
  const place = { locationId, eventDate: venueOrder.eventDate, dateEnd: venueOrder.dateEnd, rental: { startsAt: venueOrder.eventDate, endsAt: venueOrder.dateEnd } }
  const order = {
    ...venueOrder,
    bookingVersion: 2,
    rental: place.rental,
    places: [place, { ...place, locationId: '000000000000000000000006' }],
    orderItems: [{ serviceId, quantity: 1, durationMinutes: 60 }, { serviceId, quantity: 1, durationMinutes: 60 }],
  }
  assert.equal(getStep(order), null)
  order.places[1].dateEnd = '2026-12-01T11:30:00Z'
  assert.equal(getStep(order), PARTY_ORDER_WIZARD_STEP.time)
})

test('accepts structured offsite addresses and requires duration from services', () => {
  assert.equal(getStep(offsiteOrder), null)
  assert.equal(getStep({ ...offsiteOrder, servicesIds: [], durationMinutes: 60 }), PARTY_ORDER_WIZARD_STEP.services)
  assert.equal(getStep({
    ...offsiteOrder,
    orderItems: [{ serviceId, quantity: 1, durationMinutes: 0 }],
  }), PARTY_ORDER_WIZARD_STEP.services)
  assert.equal(getStep({
    ...offsiteOrder,
    clientAddress: { comment: 'Только комментарий' },
    customAddress: '  ',
  }), PARTY_ORDER_WIZARD_STEP.place)
})

test('skips final orders and missing fields outside the editor’s permissions', () => {
  const missing = { ...venueOrder, orderTypeId: null, locationId: null, eventDate: null, clientId: null }
  assert.equal(getStep({ ...missing, status: 'canceled' }), null)
  assert.equal(getStep({ ...missing, status: 'closed' }), null)
  assert.equal(getStep(missing, { can: (_field, action) => action !== 'edit' }), null)
  const canEditTime = (field, action) => action !== 'edit' || ['orders.eventDate', 'orders.dateEnd'].includes(field)
  assert.equal(getStep(missing, { can: canEditTime }), PARTY_ORDER_WIZARD_STEP.time)
  assert.equal(getStep(missing, {
    can: (field, action) => action !== 'edit' || field === 'orders.eventDate',
  }), null)
})
