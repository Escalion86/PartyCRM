import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyPublicLeadOrderPayload,
  getPartyPublicLeadApiKey,
  normalizePartyPublicLeadApiKeys,
  normalizePartyPublicLeadPayload,
  normalizePartyTildaLeadPayload,
  resolvePartyPublicLeadRouting,
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
    serviceId: ' service-1 ',
    location: ' location-1 ',
    locationTitle: ' Центральный зал ',
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
  assert.equal(payload.serviceId, 'service-1')
  assert.equal(payload.locationId, 'location-1')
  assert.equal(payload.locationTitle, 'Центральный зал')
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

test('resolvePartyPublicLeadRouting uses explicit active location and service ids first', () => {
  const normalized = normalizePartyPublicLeadPayload({
    source: 'Site',
    locationId: 'location-2',
    serviceId: 'service-2',
    serviceTitle: 'Авторская услуга',
  })

  const routing = resolvePartyPublicLeadRouting({
    normalized,
    settings: {
      publicLeadRoutingRules: [
        {
          source: 'Site',
          locationId: 'location-1',
          serviceId: 'service-1',
        },
      ],
    },
    locations: [
      { _id: 'location-1', title: 'Зал 1', status: 'active' },
      { _id: 'location-2', title: 'Зал 2', status: 'active' },
    ],
    services: [
      { _id: 'service-1', title: 'Шоу', status: 'active' },
      { _id: 'service-2', title: 'Квест', status: 'active' },
    ],
  })

  assert.equal(routing.locationId, 'location-2')
  assert.deepEqual(routing.servicesIds, ['service-2'])
  assert.equal(routing.serviceTitle, 'Квест')
  assert.equal(routing.placeType, 'company_location')
  assert.equal(routing.routing.matchedBy, 'explicit')
})

test('resolvePartyPublicLeadRouting matches source rule to active location and service', () => {
  const normalized = normalizePartyPublicLeadPayload({
    source: ' tilda ',
    serviceTitle: 'День рождения',
    locationTitle: 'Центр',
  })

  const routing = resolvePartyPublicLeadRouting({
    normalized,
    settings: {
      publicLeadRoutingRules: [
        {
          id: 'tilda-center',
          source: 'Tilda',
          matchLocationTitle: 'Центр',
          matchServiceTitle: 'День рождения',
          locationId: 'location-1',
          serviceId: 'service-1',
          enabled: true,
        },
      ],
    },
    locations: [
      { _id: 'location-1', title: 'Центр', status: 'active' },
      { _id: 'location-2', title: 'Выезд', status: 'active' },
    ],
    services: [
      { _id: 'service-1', title: 'День рождения', status: 'active' },
      { _id: 'service-2', title: 'Выпускной', status: 'active' },
    ],
  })

  assert.equal(routing.locationId, 'location-1')
  assert.deepEqual(routing.servicesIds, ['service-1'])
  assert.equal(routing.serviceTitle, 'День рождения')
  assert.equal(routing.routing.ruleId, 'tilda-center')
  assert.equal(routing.routing.matchedBy, 'rule')
})

test('resolvePartyPublicLeadRouting falls back safely when route targets are unknown', () => {
  const normalized = normalizePartyPublicLeadPayload({
    source: 'Site',
    locationTitle: 'Несуществующий зал',
    serviceTitle: 'Несуществующая услуга',
  })

  const routing = resolvePartyPublicLeadRouting({
    normalized,
    settings: {
      publicLeadRoutingRules: [
        {
          source: 'Site',
          locationId: 'missing-location',
          serviceId: 'missing-service',
        },
      ],
    },
    locations: [{ _id: 'location-1', title: 'Центр', status: 'active' }],
    services: [{ _id: 'service-1', title: 'Шоу', status: 'active' }],
  })

  assert.equal(routing.locationId, null)
  assert.deepEqual(routing.servicesIds, [])
  assert.equal(routing.serviceTitle, 'Несуществующая услуга')
  assert.equal(routing.placeType, 'company_location')
  assert.equal(routing.routing.matchedBy, 'fallback')
})

test('buildPartyPublicLeadOrderPayload applies resolved lead routing metadata', () => {
  const normalized = normalizePartyPublicLeadPayload({
    name: 'Иван',
    phone: '+79991112233',
    serviceTitle: 'День рождения',
    source: 'Tilda',
  })
  const routing = {
    locationId: 'location-1',
    servicesIds: ['service-1'],
    serviceTitle: 'День рождения',
    placeType: 'company_location',
    routing: {
      matchedBy: 'rule',
      ruleId: 'tilda-center',
      locationId: 'location-1',
      serviceId: 'service-1',
    },
  }

  const order = buildPartyPublicLeadOrderPayload({
    clientId: 'client-1',
    normalized,
    routing,
  })

  assert.equal(order.placeType, 'company_location')
  assert.equal(order.locationId, 'location-1')
  assert.deepEqual(order.servicesIds, ['service-1'])
  assert.equal(order.serviceTitle, 'День рождения')
  assert.deepEqual(order.leadMeta.routing, routing.routing)
})
