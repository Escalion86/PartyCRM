import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyBillingProviderOptions,
  getPartyPaymentStatusLabel,
  getPartyTariffActionState,
} from './partyBillingViewModel.js'

test('getPartyBillingProviderOptions returns only configured providers', () => {
  assert.deepEqual(
    getPartyBillingProviderOptions({
      providers: { yookassa: true, tochka: false },
    }),
    [
      {
        value: 'yookassa',
        label: 'ЮKassa',
        description: 'Карта, СБП и другие способы ЮKassa',
      },
    ]
  )
})

test('getPartyTariffActionState keeps free tariff selectable without provider', () => {
  assert.deepEqual(
    getPartyTariffActionState({
      tariff: { _id: 'free', price: 0 },
      activeTariffId: 'paid',
      selectedProvider: '',
    }),
    {
      isActive: false,
      isFree: true,
      disabled: false,
      buttonLabel: 'Выбрать',
    }
  )
})

test('getPartyTariffActionState disables paid tariff without provider', () => {
  assert.deepEqual(
    getPartyTariffActionState({
      tariff: { _id: 'paid', price: 990 },
      activeTariffId: 'free',
      selectedProvider: '',
    }),
    {
      isActive: false,
      isFree: false,
      disabled: true,
      buttonLabel: 'Купить за 990 ₽',
    }
  )
})

test('getPartyPaymentStatusLabel maps known payment statuses', () => {
  assert.equal(getPartyPaymentStatusLabel('succeeded'), 'Завершён')
  assert.equal(getPartyPaymentStatusLabel('pending'), 'В обработке')
  assert.equal(getPartyPaymentStatusLabel('failed'), 'Ошибка')
  assert.equal(getPartyPaymentStatusLabel('custom'), 'custom')
})
