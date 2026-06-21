import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyBalanceTopUpPaymentDraft,
  PARTY_BALANCE_TOP_UP_MAX_AMOUNT,
  PARTY_BALANCE_TOP_UP_MIN_AMOUNT,
} from './partyBillingProviderCheckoutCore.js'

test('buildPartyBalanceTopUpPaymentDraft accepts only balance top-up purpose', () => {
  assert.deepEqual(
    buildPartyBalanceTopUpPaymentDraft({ purpose: 'tariff', amount: 990 }),
    {
      ok: false,
      status: 400,
      error: 'Оплата тарифа выполняется списанием с баланса компании',
    }
  )
})

test('buildPartyBalanceTopUpPaymentDraft normalizes valid balance amount', () => {
  assert.deepEqual(
    buildPartyBalanceTopUpPaymentDraft({ purpose: 'balance', amount: '2500.90' }),
    {
      ok: true,
      purpose: 'balance',
      amount: 2500,
      description: 'Пополнение баланса PartyCRM',
    }
  )
})

test('buildPartyBalanceTopUpPaymentDraft rejects invalid top-up amount', () => {
  assert.deepEqual(buildPartyBalanceTopUpPaymentDraft({ amount: 0 }), {
    ok: false,
    status: 400,
    error: `Сумма должна быть от ${PARTY_BALANCE_TOP_UP_MIN_AMOUNT} до ${PARTY_BALANCE_TOP_UP_MAX_AMOUNT} руб.`,
  })
})
