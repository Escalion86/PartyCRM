import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyCompanyTariffAdminPatch,
  getPartyCompanyBillingLabel,
  getPartyUserDisplayName,
  getPartyUserRoleLabel,
} from './partySiteSettingsViewModel.js'

test('getPartyUserDisplayName falls back from name to phone and email', () => {
  assert.equal(
    getPartyUserDisplayName({
      firstName: 'Анна',
      secondName: 'Иванова',
      phone: '79990000000',
    }),
    'Анна Иванова'
  )
  assert.equal(getPartyUserDisplayName({ phone: '79990000000' }), '79990000000')
  assert.equal(getPartyUserDisplayName({ email: 'a@b.ru' }), 'a@b.ru')
})

test('getPartyUserRoleLabel maps global roles', () => {
  assert.equal(getPartyUserRoleLabel('dev'), 'Разработчик')
  assert.equal(getPartyUserRoleLabel('admin'), 'Администратор')
  assert.equal(getPartyUserRoleLabel('support'), 'Поддержка')
  assert.equal(getPartyUserRoleLabel('user'), 'Пользователь')
})

test('getPartyCompanyBillingLabel describes tariff and balance', () => {
  assert.equal(
    getPartyCompanyBillingLabel({
      company: { balance: 1500 },
      tariff: { title: 'Pro' },
    }),
    'Pro · 1 500 ₽'
  )
  assert.equal(getPartyCompanyBillingLabel({ company: {} }), 'Тариф не выбран')
})

test('buildPartyCompanyTariffAdminPatch normalizes admin tariff assignment', () => {
  assert.deepEqual(
    buildPartyCompanyTariffAdminPatch({
      tariffId: ' 507f1f77bcf86cd799439011 ',
      billingStatus: 'paused',
      tariffActiveUntil: '2026-07-01T00:00:00.000Z',
    }),
    {
      tariffId: '507f1f77bcf86cd799439011',
      billingStatus: 'paused',
      tariffActiveUntil: new Date('2026-07-01T00:00:00.000Z'),
    }
  )
  assert.deepEqual(buildPartyCompanyTariffAdminPatch({ tariffId: '' }), {
    tariffId: null,
  })
  assert.deepEqual(
    buildPartyCompanyTariffAdminPatch({
      tariffId: '507f1f77bcf86cd799439011',
      billingStatus: 'unknown',
      tariffActiveUntil: 'bad date',
    }),
    {
      tariffId: '507f1f77bcf86cd799439011',
    }
  )
})
