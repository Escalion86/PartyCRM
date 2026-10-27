import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePartyAiPatch, applyPartyAiPatch } from './partyOrderAi.mjs'
import {
  normalizeCompanySettings,
  mergeCompanySettingsPatch,
} from './companySettings.js'
import { getMaxContactAction, normalizeMaxContactInput } from './maxContact.js'

test('AI cannot change identity, status, transactions or foreign catalog references', () => {
  const patch = normalizePartyAiPatch(
    {
      tenantId: 'other',
      _id: 'other',
      status: 'closed',
      transactions: [{ amount: 10 }],
      clientId: 'foreign',
      locationId: 'foreign',
      servicesIds: ['allowed', 'foreign'],
      contractAmount: -2,
      eventDate: '2026-10-25T12:00:00',
    },
    { services: [{ _id: 'allowed' }] }
  )
  assert.deepEqual(patch, {})
})
test('AI applies timing and price consistently without removing existing data', () => {
  const original = {
    _id: 'order',
    status: 'draft',
    eventDate: '2026-10-25T12:00:00Z',
    durationMinutes: 60,
    additionalEvents: [{ title: 'Позвонить' }],
    clientPayment: { status: 'wait_prepayment' },
  }
  const patch = normalizePartyAiPatch(
    { durationMinutes: 90, contractAmount: 5000, locationId: 'point' },
    { locations: [{ _id: 'point' }] }
  )
  const next = applyPartyAiPatch(original, {
    ...patch,
    tenantId: 'foreign',
    status: 'closed',
  })
  assert.equal(next.dateEnd, '2026-10-25T13:30:00.000Z')
  assert.deepEqual(next.clientPayment, {
    status: 'wait_prepayment',
    totalAmount: 5000,
  })
  assert.equal(next.status, 'draft')
  assert.equal(next.placeType, 'company_location')
  assert.equal(next.tenantId, undefined)
  assert.deepEqual(original.clientPayment, { status: 'wait_prepayment' })
  assert.deepEqual(next.additionalEvents, original.additionalEvents)
})
test('form setting survives unrelated patches; invalid values have a safe default', () => {
  assert.equal(normalizeCompanySettings({}).orderFormVariant, 'compact')
  assert.equal(
    mergeCompanySettingsPatch(
      { orderFormVariant: 'classic' },
      { defaultTown: 'Москва' }
    ).orderFormVariant,
    'classic'
  )
  assert.equal(
    normalizeCompanySettings({ orderFormVariant: 'unknown' }).orderFormVariant,
    'compact'
  )
})
test('MAX normalizes phone and rejects foreign URLs', () => {
  assert.equal(getMaxContactAction('8 (999) 123-45-67').phone, '+79991234567')
  assert.equal(getMaxContactAction('https://max.ru/u/test').type, 'link')
  for (const value of [
    'javascript:alert(1)',
    'https://max.ru.evil.test/u/test',
    '',
    'abc',
  ])
    assert.equal(normalizeMaxContactInput(value), '')
})
