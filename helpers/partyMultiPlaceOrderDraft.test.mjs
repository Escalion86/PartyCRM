import assert from 'node:assert/strict'
import test from 'node:test'
import { createPartyOrderPlaceDraft, partyOrderPlaceAt, previewPartyOrderPlaceDraft, serializePartyOrderPlaceDrafts, storedPartyOrderPlaceDrafts } from './partyMultiPlaceOrderDraft.js'

test('the same service retains separate snapshots, times, and quantities at different places', () => {
  const rental = partyOrderPlaceAt('2026-12-01T14:00:00+07:00', 120)
  const places = [
    { id: 'place-a', locationId: 'room-a', eventDate: rental.startsAt, rental, locationConfiguration: { definition: null, parameters: {}, baseHourlyRate: 2000 } },
    { id: 'place-b', locationId: 'room-b', eventDate: rental.startsAt, rental, locationConfiguration: { definition: null, parameters: {}, baseHourlyRate: 1000 } },
  ]
  const savedItems = [
    { lineId: 'line-a', placeId: 'place-a', serviceId: 'game', quantity: 1, unitPrice: 5000, durationMinutes: 90, includedRentalMinutes: 60 },
    { lineId: 'line-b', placeId: 'place-b', serviceId: 'game', quantity: 2, unitPrice: 2000, durationMinutes: 20, includedRentalMinutes: 0 },
  ]
  const drafts = storedPartyOrderPlaceDrafts({ bookingVersion: 2, places, orderItems: savedItems })
  const reviews = drafts.map((place, index) => previewPartyOrderPlaceDraft({
    place, location: { title: place.locationId, hourlyRentalRate: 3333 }, savedPlace: places[index], savedItems,
    servicesById: new Map([['game', { _id: 'game', title: 'Игра', price: 9999, duration: 120, repeatable: true }]]), orderTypeId: 'type', previousTypeId: 'type',
  }))
  assert.deepEqual(reviews.map(({ duration, pricingSnapshot }) => [duration, pricingSnapshot.rentalKopecks, pricingSnapshot.servicesKopecks]), [
    [90, 200000, 500000], [40, 200000, 400000],
  ])
  assert.deepEqual(serializePartyOrderPlaceDrafts(reviews).map((place) => place.serviceSelections), [
    [{ lineId: 'line-a', serviceId: 'game', quantity: 1 }], [{ lineId: 'line-b', serviceId: 'game', quantity: 2 }],
  ])
})

test('an untimed place keeps its own duration and proposes an appropriate rental length', () => {
  const place = createPartyOrderPlaceDraft({ id: 'place', locationId: 'location', serviceSelections: [{ lineId: 'walk-a', serviceId: 'walk', quantity: 1 }] })
  const preview = previewPartyOrderPlaceDraft({
    place, location: { title: 'Зал' }, servicesById: new Map([['walk', { _id: 'walk', title: 'Игра', duration: 25 }]]),
    savedItems: [], orderTypeId: 'type',
  })
  assert.equal(preview.timed, false)
  assert.equal(preview.rentalMinutes, 25)
  assert.equal(serializePartyOrderPlaceDrafts([preview])[0].eventDate, null)
})
