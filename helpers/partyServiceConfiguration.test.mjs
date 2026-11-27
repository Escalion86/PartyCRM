import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePartyServiceConfiguration,
  normalizePartyServiceConfiguration,
  redactPartyServiceConfigurationPrices,
} from './partyServiceConfiguration.js'

const configuration = normalizePartyServiceConfiguration({
  participantTiers: [
    { min: 50, includedParticipants: 49, max: 70, price: 10000, pricePerParticipant: '350,25', maxPrice: 12000 },
    { min: 1, max: 10, price: 4500, durationMinutes: 40 },
    { min: 11, max: 49, price: 6200 },
  ],
  addons: [{ id: 'photo', title: 'Фото', priceDelta: '250,10', durationDelta: 20 }],
  optionGroups: [{ id: 'mode', title: 'Формат', required: true, options: [
    { id: 'standard', title: 'Стандарт' },
    { id: 'extended', title: 'Расширенный', priceDelta: 1000.2, durationDelta: 30 },
  ] }],
})
const service = { price: 3000, duration: 60, configuration }
const calculate = (participants, extra) => calculatePartyServiceConfiguration(service, {
  participants, optionIds: { mode: 'standard' }, ...extra,
})

test('inclusive tiers set the price and duration and inherit omitted values', () => {
  assert.deepEqual([1, 10, 11, 49].map((count) => calculate(count).unitPrice), [4500, 4500, 6200, 6200])
  assert.deepEqual([10, 11].map((count) => calculate(count).durationMinutes), [40, 60])
  assert.throws(() => calculate(71), { field: 'participants' })
  assert.throws(() => calculate(10.5), { field: 'participants' })
  assert.throws(() => calculate(''), { field: 'participants' })
})

test('participant surcharge and tier cap apply before addons and options', () => {
  assert.equal(calculate(50).unitPrice, 10350.25)
  assert.equal(calculate(51).unitPrice, 10700.5)
  const result = calculate('70', { addonIds: ['photo'], optionIds: { mode: 'extended' } })
  assert.deepEqual(result, {
    parameters: { participants: 70, addonIds: ['photo'], optionIds: { mode: 'extended' } },
    unitPrice: 13250.3,
    durationMinutes: 110,
    details: ['Участников: 70', 'Фото', 'Формат: Расширенный'],
  })
})

test('an open tier can inherit base price and start charging at its lower bound', () => {
  const configuration = normalizePartyServiceConfiguration({ participantTiers: [{ min: 50, pricePerParticipant: 200 }] })
  assert.equal(calculatePartyServiceConfiguration({ ...service, configuration }, { participants: 50 }).unitPrice, 3200)
  assert.throws(() => calculatePartyServiceConfiguration({ ...service, configuration }, { participants: 49 }), { field: 'participants' })
})

test('only listed choices are accepted and selection results have stable order', () => {
  assert.throws(() => calculate(10, { optionIds: {} }), { field: 'optionIds.mode' })
  assert.throws(() => calculate(10, { addonIds: ['not-listed'] }), { field: 'addonIds' })
  assert.throws(() => calculate(10, { addonIds: ['photo', 'photo'] }), { field: 'addonIds' })
  assert.throws(() => calculate(10, { optionIds: { mode: 'removed' } }), { field: 'optionIds.mode' })
  const configuration = normalizePartyServiceConfiguration({ addons: [{ id: 'a', title: 'А' }, { id: 'b', title: 'Б' }] })
  const result = calculatePartyServiceConfiguration({ ...service, configuration }, { addonIds: ['b', 'a'] })
  assert.deepEqual(result.parameters.addonIds, ['a', 'b'])
})

test('catalog validation rejects overlaps, invalid monetary values and duplicate choices', () => {
  assert.equal(normalizePartyServiceConfiguration({}), null)
  assert.throws(() => normalizePartyServiceConfiguration({ participantTiers: [{ min: 1, max: 10 }, { min: 10 }] }), /пересекаться/)
  assert.throws(() => normalizePartyServiceConfiguration({ participantTiers: [{ min: 1 }, { min: 11 }] }), /пересекаться/)
  assert.throws(() => normalizePartyServiceConfiguration({ participantTiers: [{ min: 1, price: 1.001 }] }), /копеек/)
  assert.throws(() => normalizePartyServiceConfiguration({ addons: [{ id: 'a', title: 'А' }, { id: 'a', title: 'Б' }] }), /уникальными/)
  assert.throws(() => normalizePartyServiceConfiguration({ optionGroups: [{ id: '__proto__', title: 'Формат', options: [{ id: 'a', title: 'А' }] }] }), { status: 400 })
  assert.throws(() => normalizePartyServiceConfiguration({ optionGroups: [{ id: 'a', title: 'Формат' }] }), /Добавьте варианты/)
})

test('redacted rules yield identical durations and labels without leaking monetary fields', () => {
  const redacted = redactPartyServiceConfigurationPrices(configuration)
  assert.doesNotMatch(JSON.stringify(redacted), /price/i)
  const selection = { participants: 55, addonIds: ['photo'], optionIds: { mode: 'extended' } }
  const result = calculatePartyServiceConfiguration({ configuration: redacted, duration: 60 }, selection)
  const actual = calculatePartyServiceConfiguration(service, selection)
  assert.deepEqual(result, { ...actual, unitPrice: 0 })
})

test('signed adjustments can shorten the service and reject negative final values', () => {
  const configuration = normalizePartyServiceConfiguration({ addons: [{ id: 'a', title: 'Короткая версия', priceDelta: -100, durationDelta: -30 }] })
  const selection = { addonIds: ['a'] }
  assert.equal(calculatePartyServiceConfiguration({ ...service, configuration }, selection).durationMinutes, 30)
  assert.throws(() => calculatePartyServiceConfiguration({ price: 0, duration: 60, configuration }, selection), /стоимость/)
  assert.throws(() => calculatePartyServiceConfiguration({ price: 100, duration: 20, configuration }, selection), /длительность/)
})
