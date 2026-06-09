import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canCreatePartyOrderByTariff,
  canCreatePartyStaffByTariff,
  getPartyCompanyTariffAccess,
  filterPartyOrderPayloadByTariffAccess,
  serializePartyTariffAccess,
} from './partyTariffAccess.js'

test('getPartyCompanyTariffAccess derives feature flags from company tariff', () => {
  const access = getPartyCompanyTariffAccess(
    { tariffId: 'pro' },
    [
      {
        _id: 'pro',
        eventsPerMonth: 120,
        allowCalendarSync: true,
        allowStatistics: true,
        allowDocuments: false,
        allowTelephony: true,
        allowAi: false,
      },
    ]
  )

  assert.equal(access.hasTariff, true)
  assert.equal(access.allowCalendarSync, true)
  assert.equal(access.allowStatistics, true)
  assert.equal(access.allowDocuments, false)
  assert.equal(access.allowTelephony, true)
  assert.equal(access.allowAi, false)
  assert.equal(access.eventsPerMonth, 120)
})

test('getPartyCompanyTariffAccess grants trial features and unlimited events', () => {
  const access = getPartyCompanyTariffAccess({
    tariffId: null,
    trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
  })

  assert.equal(access.trialActive, true)
  assert.equal(access.allowCalendarSync, true)
  assert.equal(access.allowStatistics, true)
  assert.equal(access.allowDocuments, true)
  assert.equal(access.allowTelephony, false)
  assert.equal(access.allowAi, false)
  assert.equal(access.eventsPerMonth, Infinity)
})

test('getPartyCompanyTariffAccess treats zero tariff limits as unlimited', () => {
  const access = getPartyCompanyTariffAccess(
    { tariffId: 'max' },
    [{ _id: 'max', eventsPerMonth: 0, staffLimit: 0 }]
  )

  assert.equal(access.eventsPerMonth, Infinity)
  assert.equal(access.staffLimit, Infinity)
})

test('canCreatePartyOrderByTariff blocks when monthly limit is reached', () => {
  assert.deepEqual(
    canCreatePartyOrderByTariff({
      access: { eventsPerMonth: 2 },
      currentMonthOrdersCount: 2,
    }),
    {
      ok: false,
      code: 'partycrm_tariff_orders_limit_reached',
      message: 'Лимит заказов по тарифу исчерпан',
    }
  )
  assert.equal(
    canCreatePartyOrderByTariff({
      access: { eventsPerMonth: 2 },
      currentMonthOrdersCount: 1,
    }).ok,
    true
  )
})

test('canCreatePartyStaffByTariff blocks when staff limit is reached', () => {
  assert.deepEqual(
    canCreatePartyStaffByTariff({
      access: { staffLimit: 3 },
      currentStaffCount: 3,
    }),
    {
      ok: false,
      code: 'partycrm_tariff_staff_limit_reached',
      message: 'Лимит сотрудников по тарифу исчерпан',
    }
  )
  assert.equal(
    canCreatePartyStaffByTariff({
      access: { staffLimit: Infinity },
      currentStaffCount: 100,
    }).ok,
    true
  )
})

test('filterPartyOrderPayloadByTariffAccess removes calendar ids without calendar flag', () => {
  assert.deepEqual(
    filterPartyOrderPayloadByTariffAccess(
      {
        title: 'Order',
        additionalEvents: [
          { title: 'Task', googleCalendarEventId: 'calendar-id' },
        ],
      },
      { allowCalendarSync: false }
    ),
    {
      title: 'Order',
      additionalEvents: [{ title: 'Task', googleCalendarEventId: '' }],
    }
  )
})

test('serializePartyTariffAccess keeps unlimited events JSON-safe', () => {
  assert.deepEqual(
    serializePartyTariffAccess({
      trialActive: true,
      hasTariff: true,
      allowCalendarSync: true,
      allowStatistics: true,
      allowDocuments: true,
      allowTelephony: false,
      allowAi: false,
      eventsPerMonth: Infinity,
      staffLimit: Infinity,
      tariff: { _id: 'pro', title: 'Pro' },
    }),
    {
      trialActive: true,
      hasTariff: true,
      allowCalendarSync: true,
      allowStatistics: true,
      allowDocuments: true,
      allowTelephony: false,
      allowAi: false,
      eventsPerMonth: null,
      unlimitedEvents: true,
      staffLimit: null,
      unlimitedStaff: true,
      tariff: { _id: 'pro', title: 'Pro' },
    }
  )
})
