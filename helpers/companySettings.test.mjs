import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeCompanySettingsPatch,
  normalizeCompanySettings,
} from './companySettings.js'

test('normalizeCompanySettings deduplicates towns', () => {
  const settings = normalizeCompanySettings({ towns: ['Москва', ' Москва ', ''] })
  assert.deepEqual(settings.towns, ['Москва'])
})

test('normalizeCompanySettings deduplicates event types', () => {
  const settings = normalizeCompanySettings({
    eventTypes: ['День рождения', ' День рождения ', 'Свадьба'],
  })

  assert.deepEqual(settings.eventTypes, ['День рождения', 'Свадьба'])
})

test('mergeCompanySettingsPatch keeps previous notifications object', () => {
  const next = mergeCompanySettingsPatch(
    { notifications: { pushEnabled: true } },
    { timeZone: 'Europe/Moscow' }
  )

  assert.equal(next.timeZone, 'Europe/Moscow')
  assert.equal(next.notifications.pushEnabled, true)
})
