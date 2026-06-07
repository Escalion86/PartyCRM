import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyCompanyTariffPurchaseState,
  isPartyCompanyBalanceEnough,
} from './partyCompanyBillingCore.js'

test('isPartyCompanyBalanceEnough compares company balance and tariff price', () => {
  assert.equal(isPartyCompanyBalanceEnough({ balance: 1000, price: 990 }), true)
  assert.equal(isPartyCompanyBalanceEnough({ balance: 100, price: 990 }), false)
  assert.equal(isPartyCompanyBalanceEnough({ balance: 0, price: 0 }), true)
})

test('buildPartyCompanyTariffPurchaseState activates free tariff without balance charge', () => {
  const state = buildPartyCompanyTariffPurchaseState({
    company: { balance: 250 },
    tariff: { _id: 'free', price: 0 },
    now: new Date('2026-06-07T00:00:00Z'),
  })

  assert.equal(state.ok, true)
  assert.equal(state.nextCompany.balance, 250)
  assert.equal(state.nextCompany.tariffId, 'free')
  assert.equal(state.nextCompany.tariffActiveUntil, null)
  assert.equal(state.nextCompany.nextChargeAt, null)
})

test('buildPartyCompanyTariffPurchaseState charges paid tariff from company balance', () => {
  const state = buildPartyCompanyTariffPurchaseState({
    company: { balance: 1500 },
    tariff: { _id: 'paid', price: 990 },
    now: new Date('2026-06-07T00:00:00Z'),
  })

  assert.equal(state.ok, true)
  assert.equal(state.nextCompany.balance, 510)
  assert.equal(state.nextCompany.tariffId, 'paid')
  assert.equal(
    state.nextCompany.tariffActiveUntil.toISOString(),
    '2026-07-07T00:00:00.000Z'
  )
  assert.equal(
    state.nextCompany.nextChargeAt.toISOString(),
    '2026-07-07T00:00:00.000Z'
  )
})

test('buildPartyCompanyTariffPurchaseState rejects paid tariff when company balance is low', () => {
  const state = buildPartyCompanyTariffPurchaseState({
    company: { balance: 100 },
    tariff: { _id: 'paid', price: 990 },
    now: new Date('2026-06-07T00:00:00Z'),
  })

  assert.equal(state.ok, false)
  assert.match(state.error, /Недостаточно средств/)
})
