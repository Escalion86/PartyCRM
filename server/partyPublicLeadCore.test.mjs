import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyPublicLeadOrderPayload,
  getPartyPublicLeadApiKey,
  normalizePartyPublicLeadApiKeys,
  normalizePartyPublicLeadPayload,
  normalizePartyTildaLeadPayload,
} from './partyPublicLeadCore.js'

test('normalizePartyPublicLeadApiKeys keeps enabled named keys', () => {
  const keys = normalizePartyPublicLeadApiKeys({
    publicLeadApiKey: 'legacy-key',
    publicLeadApiKeys: [
      { id: 'main', name: 'Tilda', key: ' key-1 ', enabled: true },
      { id: 'off', name: 'Off', key: 'key-2', enabled: false },
      { id: 'empty', key: '' },
    ],
  })

  assert.deepEqual(keys, [
    { id: 'main', name: 'Tilda', key: 'key-1', enabled: true },
    { id: 'off', name: 'Off', key: 'key-2', enabled: false },
    { id: 'legacy', name: 'Основной API', key: 'legacy-key', enabled: true },
  ])
})

test('getPartyPublicLeadApiKey reads header and body aliases', () => {
  const req = {
    headers: new Map([['x-api-key', ' header-key ']]),
  }

  assert.equal(getPartyPublicLeadApiKey(req, {}), 'header-key')
  assert.equal(getPartyPublicLeadApiKey({ headers: new Map() }, { api_key: 'body-key' }), 'body-key')
})

test('normalizePartyPublicLeadPayload normalizes client and order fields', () => {
  const payload = normalizePartyPublicLeadPayload({
    name: ' Иван ',
    phone: '+7 (999) 111-22-33',
    email: ' IVAN@TEST.RU ',
    telegram: '@ivan',
    eventDate: '2026-07-01T12:00:00+07:00',
    source: 'Tilda',
    serviceTitle: 'Аниматор',
    contractAmount: '15000',
    town: 'Красноярск',
    address: 'ул. Мира, 1',
    comment: 'Комментарий',
  })

  assert.equal(payload.clientName, 'Иван')
  assert.equal(payload.phone, '79991112233')
  assert.equal(payload.email, 'ivan@test.ru')
  assert.equal(payload.eventDate.toISOString(), '2026-07-01T05:00:00.000Z')
  assert.equal(payload.contractAmount, 15000)
  assert.equal(payload.source, 'Tilda')
})

test('normalizePartyTildaLeadPayload maps common Tilda fields', () => {
  const payload = normalizePartyTildaLeadPayload({
    Name: 'Анна',
    Phone: '+79990000000',
    Email: 'anna@test.ru',
    date: '2026-08-01',
    service: 'Шоу',
    payment: '12000',
  })

  assert.equal(payload.clientName, 'Анна')
  assert.equal(payload.phone, '79990000000')
  assert.equal(payload.email, 'anna@test.ru')
  assert.equal(payload.source, 'Tilda')
  assert.equal(payload.serviceTitle, 'Шоу')
  assert.equal(payload.contractAmount, 12000)
})

test('buildPartyPublicLeadOrderPayload creates draft client-address order', () => {
  const normalized = normalizePartyPublicLeadPayload({
    name: 'Иван',
    phone: '+79991112233',
    serviceTitle: 'Аниматор',
    town: 'Красноярск',
    address: 'ул. Мира, 1',
    source: 'Tilda',
  })
  const order = buildPartyPublicLeadOrderPayload({
    clientId: 'client-1',
    normalized,
    apiKeyData: { id: 'main', name: 'Tilda form' },
    rawPayload: { a: 1 },
  })

  assert.equal(order.status, 'draft')
  assert.equal(order.clientId, 'client-1')
  assert.equal(order.placeType, 'client_address')
  assert.equal(order.client.name, 'Иван')
  assert.equal(order.leadSource, 'Tilda')
  assert.equal(order.leadMeta.apiKeyName, 'Tilda form')
  assert.deepEqual(order.leadMeta.raw, { a: 1 })
})
