import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyBillingProviderOptions,
  getPartyPaymentStatusLabel,
  getPartyTariffAccessRows,
  getPartyTariffSelectOptions,
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

test('getPartyTariffSelectOptions builds labels for company tariff field', () => {
  assert.deepEqual(
    getPartyTariffSelectOptions([
      { _id: 'free', title: 'Free', price: 0 },
      { _id: 'pro', title: 'Pro', price: 1500 },
    ]),
    [
      { value: 'free', label: 'Free - бесплатно' },
      { value: 'pro', label: 'Pro - 1 500 ₽/мес' },
    ]
  )
})

test('getPartyTariffAccessRows describes company feature flags', () => {
  assert.deepEqual(
    getPartyTariffAccessRows({
      allowDocuments: true,
      allowStatistics: false,
      allowCalendarSync: true,
      allowTelephony: false,
      allowAi: true,
      unlimitedEvents: false,
      eventsPerMonth: 50,
      unlimitedStaff: false,
      staffLimit: 12,
    }),
    [
      { label: 'Заказы в месяц', value: '50' },
      { label: 'Сотрудники', value: '12' },
      { label: 'Документы', value: 'Доступно' },
      { label: 'Статистика', value: 'Недоступно' },
      { label: 'Google Calendar', value: 'Доступно' },
      { label: 'Телефония', value: 'Недоступно' },
      { label: 'AI', value: 'Доступно' },
    ]
  )
})
