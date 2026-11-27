import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePartyMultiPlaceTotal,
  calculatePartyPlaceBooking,
  normalizePartyLocationRentalConfiguration,
  redactPartyLocationRentalSnapshot,
} from './partyMultiPlaceBooking.js'

const at = (time) => `2026-11-27T${time}:00+07:00`
const roomA = { hourlyRentalRate: 2000 }
const roomB = { hourlyRentalRate: 1500 }
const place = (location, startsAt, endsAt, items) => ({
  eventDate: at(startsAt), dateEnd: at(endsAt),
  ...calculatePartyPlaceBooking({ location, items, rental: { startsAt: at(startsAt), endsAt: at(endsAt) } }),
})

test('rent is rounded independently for two simultaneous rooms, with one discount', () => {
  const first = place(roomA, '14:00', '16:00', [{ quantity: 1, unitPrice: 5000, includedRentalMinutes: 60, durationMinutes: 120 }])
  const second = place(roomB, '14:30', '15:30', [{ quantity: 1, unitPrice: 2000, durationMinutes: 60 }])
  assert.equal(first.pricingSnapshot.payableMinutes, 60)
  assert.equal(second.pricingSnapshot.payableMinutes, 60)
  assert.deepEqual(calculatePartyMultiPlaceTotal([first, second], { type: 'percent', value: 10 }), {
    servicesKopecks: 700000, rentalKopecks: 350000, rentalExtrasKopecks: 0,
    subtotalKopecks: 1050000, discountKopecks: 105000, totalKopecks: 945000, durationMinutes: 120,
  })
  const extraIncluded = place(roomA, '14:00', '14:30', [{ quantity: 1, unitPrice: 5000, includedRentalMinutes: 90 }])
  assert.equal(calculatePartyMultiPlaceTotal([extraIncluded, second]).rentalKopecks, 150000)
})

const configuration = normalizePartyLocationRentalConfiguration({
  hourlyRate: { fields: [{ type: 'ranges', id: 'guests', title: 'Гости', unit: 'чел.', required: true, mode: 'base', tiers: [
    { min: 1, max: 10, price: 1000 }, { min: 11, max: 20, price: 1800 },
  ] }] },
  extras: { fields: [{ type: 'checkboxes', id: 'options', title: 'Оборудование', options: [
    { id: 'projector', title: 'Проектор', priceDelta: 500 },
  ] }] },
})

test('configurable hourly rate and fixed add-ons use independent price effects and saved terms', () => {
  const location = { hourlyRentalRate: 1200, rentalConfiguration: configuration }
  const parameters = { hourlyRate: { values: { guests: 12 } }, extras: { values: { options: ['projector'] } } }
  const rental = { startsAt: at('14:00'), endsAt: at('15:30') }
  const saved = calculatePartyPlaceBooking({ location, parameters, rental, items: [] })
  assert.equal(saved.pricingSnapshot.rentalKopecks, 360000)
  assert.equal(saved.pricingSnapshot.rentalExtrasKopecks, 50000)
  assert.equal(saved.pricingSnapshot.totalKopecks, 410000)
  assert.deepEqual(saved.locationConfiguration.parameters, parameters)
  assert.deepEqual(saved.locationConfiguration.details, ['Гости: 12 чел.', 'Оборудование: Проектор'])
  assert.deepEqual(calculatePartyPlaceBooking({ location: roomA, rental, items: [], locationConfiguration: saved.locationConfiguration }), saved)
  assert.throws(() => calculatePartyPlaceBooking({ location, rental, items: [] }), { field: 'values.guests' })
  const masked = redactPartyLocationRentalSnapshot(saved.locationConfiguration)
  assert.doesNotMatch(JSON.stringify(masked), /price|baseHourlyRate|1800|500/i)
  assert.equal(calculatePartyPlaceBooking({ location, rental, items: [], locationConfiguration: masked }).pricingSnapshot.totalKopecks, 0)
})

test('rental rules cannot assign duration and an empty definition clears them', () => {
  assert.equal(normalizePartyLocationRentalConfiguration({ hourlyRate: { fields: [] }, extras: null }), null)
  assert.throws(() => normalizePartyLocationRentalConfiguration({ hourlyRate: { fields: [
    { type: 'number', id: 'units', title: 'Количество', unit: 'шт.', durationPerUnit: 5 },
  ] } }), /Время аренды/)
})
