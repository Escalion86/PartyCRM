import test from 'node:test'
import assert from 'node:assert/strict'

import {
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

test('getPartyTariffCheckoutRequest uses selected provider for paid tariff', () => {
  const request = getPartyTariffCheckoutRequest({
    tariff: { _id: 'paid', price: 990 },
    provider: 'tochka',
  })

  assert.deepEqual(request, {
    endpoint: '/api/party/billing/tochka/create',
    body: {
      tariffId: 'paid',
      purpose: 'tariff',
      amount: 990,
    },
    requiresPayment: true,
  })
})
