import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyBalanceTopUpRequest,
  getPartyTariffCheckoutRequest,
  isFreePartyTariff,
} from './partyBillingCheckout.js'

test('isFreePartyTariff detects zero price tariffs', () => {
  assert.equal(isFreePartyTariff({ price: 0 }), true)
  assert.equal(isFreePartyTariff({ price: '0' }), true)
  assert.equal(isFreePartyTariff({ price: 490 }), false)
  assert.equal(isFreePartyTariff(null), false)
})

test('getPartyTariffCheckoutRequest uses direct select for free tariff', () => {
  const request = getPartyTariffCheckoutRequest({
    tariff: { _id: 'free', price: 0 },
    provider: 'yookassa',
  })

  assert.deepEqual(request, {
    endpoint: '/api/party/billing/tariff/select',
    body: {
      tariffId: 'free',
    },
    requiresPayment: false,
  })
})

test('getPartyTariffCheckoutRequest uses company balance for paid tariff', () => {
  const request = getPartyTariffCheckoutRequest({
    tariff: { _id: 'paid', price: 990 },
    provider: '',
  })

  assert.deepEqual(request, {
    endpoint: '/api/party/billing/tariff/select',
    body: {
      tariffId: 'paid',
    },
    requiresPayment: false,
  })
})

test('getPartyBalanceTopUpRequest uses selected provider to top up company balance', () => {
  const request = getPartyBalanceTopUpRequest({
    provider: 'yookassa',
    amount: '2500',
  })

  assert.deepEqual(request, {
    endpoint: '/api/party/billing/yookassa/create',
    body: {
      purpose: 'balance',
      amount: 2500,
    },
    requiresPayment: true,
  })
})

test('getPartyBalanceTopUpRequest rejects unknown provider and invalid amount', () => {
  assert.equal(
    getPartyBalanceTopUpRequest({ provider: 'unknown', amount: 2500 }),
    null
  )
  assert.equal(
    getPartyBalanceTopUpRequest({ provider: 'yookassa', amount: 0 }),
    null
  )
})
