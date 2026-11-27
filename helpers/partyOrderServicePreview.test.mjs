import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyPartyOrderServiceParameters, previewPartyOrderService } from './partyOrderServicePreview.js'
import { normalizePartyServiceConfiguration, redactPartyServiceConfigurationPrices } from './partyServiceConfiguration.js'
import { calculatePartyBooking } from './partyOrderBooking.js'

const definition = normalizePartyServiceConfiguration({
  participantTiers: [{ min: 1, max: 10 }, { min: 11, max: 20, price: 6000, durationMinutes: 75 }],
  addons: [{ id: 'props', title: 'Реквизит', priceDelta: 500, durationDelta: 10 }],
  optionGroups: [{ id: 'format', title: 'Формат', required: true, options: [{ id: 'long', title: 'Расширенный', priceDelta: 700, durationDelta: 15 }] }],
})
const parameters = { participants: '11', addonIds: ['props'], optionIds: { format: 'long' } }
const selection = { serviceId: 'service', quantity: 2, parameters }

test('a saved service preview uses its original rules even after the catalog changes', () => {
  const catalog = { title: 'Новое название', price: 9000, duration: 180, configuration: null }
  const prior = { title: 'Игра', serviceConfiguration: { definition, basePrice: 4000, baseDuration: 60 } }
  const result = previewPartyOrderService(catalog, prior, selection)
  assert.equal(result.error, null)
  assert.equal(result.item.title, 'Игра')
  assert.equal(result.item.durationMinutes, 100)
  assert.equal(result.item.unitPrice, 7200)
  assert.equal(result.item.quantity, 2)
  assert.deepEqual(result.normalizedParameters, { ...parameters, participants: 11 })
})

test('a redacted configuration keeps the scheduling preview and identifies missing choices', () => {
  const catalog = { title: 'Игра', duration: 60, configuration: redactPartyServiceConfigurationPrices(definition) }
  const result = previewPartyOrderService(catalog, null, selection)
  assert.equal(result.error, null)
  assert.equal(result.item.durationMinutes, 100)
  const empty = previewPartyOrderService(catalog, null, { ...selection, parameters: emptyPartyOrderServiceParameters() })
  assert.equal(empty.error.field, 'participants')
  const missingOption = previewPartyOrderService(catalog, null, { ...selection, parameters: { ...parameters, optionIds: {} } })
  assert.equal(missingOption.error.field, 'optionIds.format')
})

test('editing other order fields does not silently configure a saved fixed service', () => {
  const catalog = { title: 'Игра', price: 9000, duration: 180, configuration: definition }
  const prior = { unitPrice: 3000, durationMinutes: 60 }
  const result = previewPartyOrderService(catalog, prior, { serviceId: 'service', quantity: 1 })
  assert.equal(result.error, null)
  assert.equal(result.configuration, null)
  assert.equal(result.item.unitPrice, 3000)
  assert.equal(result.item.durationMinutes, 60)
})

test('a catalog edit updates the cost and scheduled length for an unsaved configurable service', () => {
  const before = { title: 'Игра', price: 4000, duration: 60, configuration: definition }
  const after = {
    ...before,
    configuration: {
      ...definition,
      participantTiers: [definition.participantTiers[0], { ...definition.participantTiers[1], price: 6500, durationMinutes: 90 }],
    },
  }
  const estimate = (service) => calculatePartyBooking({
    items: [previewPartyOrderService(service, null, selection).item],
    placeType: 'client_address',
  })
  assert.equal(estimate(before).durationMinutes, 200)
  assert.equal(estimate(before).totalKopecks, 1440000)
  assert.equal(estimate(after).durationMinutes, 230)
  assert.equal(estimate(after).totalKopecks, 1540000)
})

test('custom fields combine arbitrary numbers, ranges and selected choices in the booking preview', () => {
  const configuration = normalizePartyServiceConfiguration({ fields: [
    { id: 'sets', title: 'Количество комплектов', type: 'number', unit: 'комплект', required: true, allowDecimal: true, max: 20, pricePerUnit: 120, durationPerUnit: 4 },
    { id: 'days', title: 'Дни аренды', type: 'ranges', unit: 'день', required: true, mode: 'adjustment', tiers: [{ min: 1, max: 2, price: 1000, durationMinutes: 15 }] },
    { id: 'style', title: 'Вариант подачи', type: 'select', options: [{ id: 'evening', title: 'Вечерний', priceDelta: 500, durationDelta: 10 }] },
    { id: 'extras', title: 'Материалы', type: 'checkboxes', options: [{ id: 'paper', title: 'Бумага', priceDelta: 200, durationDelta: 5 }] },
  ] })
  const catalog = { title: 'Прокат', price: 4000, duration: 60, configuration }
  const values = { sets: '2.5', days: '2', style: 'evening', extras: ['paper'] }
  const result = previewPartyOrderService(catalog, null, { ...selection, parameters: { values } })
  assert.equal(result.error, null)
  assert.equal(result.item.unitPrice, 6000)
  assert.equal(result.item.durationMinutes, 100)
  assert.deepEqual(result.normalizedParameters, { values: { ...values, sets: 2.5, days: 2 } })

  assert.deepEqual(emptyPartyOrderServiceParameters(configuration), { values: {} })
  const empty = previewPartyOrderService(catalog, null, { serviceId: 'new', quantity: 1 })
  assert.equal(empty.error.field, 'values.sets')

  const prior = { title: 'Игра', serviceConfiguration: { definition, parameters, basePrice: 4000, baseDuration: 60 } }
  const saved = previewPartyOrderService(catalog, prior, { serviceId: 'saved', quantity: 1 })
  assert.equal(saved.error, null)
  assert.equal(saved.item.unitPrice, 7200)
  assert.equal(saved.configuration, definition)
})
