import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePartyServiceConfiguration,
  editablePartyServiceConfiguration,
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

const customFields = [
  { type: 'number', id: 'area', title: 'Площадь', unit: 'м²', min: 0.5, max: 100, allowDecimal: true, required: true, pricePerUnit: '25,25', durationPerUnit: 3 },
  { type: 'ranges', mode: 'base', id: 'distance', title: 'Расстояние', unit: 'км', required: true, tiers: [
    { min: 0, max: 5, price: 500, durationMinutes: 20 },
    { min: 6, max: 15, price: 800, durationMinutes: 40, includedUnits: 5, pricePerUnit: 150, maxPrice: 1200 },
  ] },
  { type: 'ranges', id: 'floors', title: 'Этажи', unit: 'эт.', tiers: [
    { min: 1, max: 3, price: 0, durationMinutes: 0 },
    { min: 4, price: 200, durationMinutes: 10, pricePerUnit: -10 },
  ] },
  { type: 'select', id: 'finish', title: 'Покрытие', required: true, options: [{ id: 'matte', title: 'Матовое', priceDelta: -30, durationDelta: -5 }] },
  { type: 'checkboxes', id: 'extras', title: 'Комплектация', options: [
    { id: 'tape', title: 'Лента', priceDelta: 10 },
    { id: 'tray', title: 'Лоток', priceDelta: 5 },
  ] },
]
const customService = { price: 900, duration: 60, configuration: normalizePartyServiceConfiguration({ fields: customFields }) }
const customSelection = { values: { extras: ['tray', 'tape'], finish: 'matte', floors: 4, distance: 10, area: '2,50' } }

test('arbitrary named parameters add rates and adjustments to the selected base range', () => {
  const result = calculatePartyServiceConfiguration(customService, customSelection)
  assert.deepEqual(result, {
    unitPrice: 1438.13,
    durationMinutes: 53,
    parameters: { values: { area: 2.5, distance: 10, floors: 4, finish: 'matte', extras: ['tape', 'tray'] } },
    details: ['Площадь: 2,5 м²', 'Расстояние: 10 км', 'Этажи: 4 эт.', 'Покрытие: Матовое', 'Комплектация: Лента, Лоток'],
  })
  const reordered = normalizePartyServiceConfiguration({ fields: customFields.toReversed() })
  assert.equal(calculatePartyServiceConfiguration({ ...customService, configuration: reordered }, customSelection).unitPrice, result.unitPrice)
})

test('validates required choices, numeric fields and the limit of an individual range', () => {
  const calculate = (values) => calculatePartyServiceConfiguration(customService, { values: { ...customSelection.values, ...values } })
  assert.throws(() => calculate({ area: '' }), { field: 'values.area' })
  assert.throws(() => calculate({ area: 2.501 }), { field: 'values.area' })
  assert.throws(() => calculate({ distance: 16 }), { field: 'values.distance' })
  assert.throws(() => calculate({ finish: 'gone' }), { field: 'values.finish' })
  assert.throws(() => calculate({ extras: ['gone'] }), { field: 'values.extras' })
  assert.throws(() => calculate({ old: 'some' }), { status: 400 })
  const required = normalizePartyServiceConfiguration({ fields: [{ ...customFields.at(-1), required: true }] })
  assert.throws(() => calculatePartyServiceConfiguration({ configuration: required }, { values: { extras: [] } }), { field: 'values.extras' })
})

test('validates custom configurations before they are stored in the catalog', () => {
  assert.equal(normalizePartyServiceConfiguration({ fields: [] }), null)
  assert.throws(() => normalizePartyServiceConfiguration({ fields: [{ ...customFields[0], unit: '' }] }), /единицу измерения/)
  assert.throws(() => normalizePartyServiceConfiguration({ fields: [customFields[0], customFields[0]] }), /уникальными/)
  assert.throws(() => normalizePartyServiceConfiguration({ fields: [customFields[1], { ...customFields[1], id: 'another' }] }), /Только один/)
  assert.throws(() => normalizePartyServiceConfiguration({ fields: [{ ...customFields[1], tiers: [{ min: 1, max: 2 }, { min: 2 }] }] }), /пересекаться/)
})

test('price masking keeps custom field labels, values and duration', () => {
  const configuration = redactPartyServiceConfigurationPrices(customService.configuration)
  assert.doesNotMatch(JSON.stringify(configuration), /price/i)
  const masked = calculatePartyServiceConfiguration({ duration: 60, configuration }, customSelection)
  assert.deepEqual(masked, { ...calculatePartyServiceConfiguration(customService, customSelection), unitPrice: 0 })
})

test('opening old rules in the custom editor preserves their pricing when saved in the new format', () => {
  const converted = normalizePartyServiceConfiguration(editablePartyServiceConfiguration(configuration))
  const customized = { ...service, configuration: converted }
  const { unitPrice, durationMinutes } = calculate(55, { addonIds: ['photo'], optionIds: { mode: 'extended' } })
  const calculated = calculatePartyServiceConfiguration(customized, { values: { 'legacy-participants': 55, 'legacy-addons': ['photo'], mode: 'extended' } })
  assert.equal(calculated.unitPrice, unitPrice)
  assert.equal(calculated.durationMinutes, durationMinutes)
  assert.deepEqual(editablePartyServiceConfiguration(null), { fields: [] })
})
