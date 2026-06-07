import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PARTY_SITE_SETTINGS_TABS,
  canAccessPartySiteSettings,
  isPartySiteSettingsPath,
} from './siteSettingsNav.js'

test('Party site settings tabs include required dev sections', () => {
  assert.deepEqual(
    PARTY_SITE_SETTINGS_TABS.map((item) => item.label),
    ['Тарифы', 'Пользователи', 'Компании', 'Разработчик']
  )
})

test('Party site settings are dev-only', () => {
  assert.equal(canAccessPartySiteSettings('dev'), true)
  assert.equal(canAccessPartySiteSettings('admin'), false)
  assert.equal(canAccessPartySiteSettings('support'), false)
  assert.equal(canAccessPartySiteSettings('user'), false)
})

test('isPartySiteSettingsPath detects site settings routes', () => {
  assert.equal(isPartySiteSettingsPath('/party/site-settings'), true)
  assert.equal(isPartySiteSettingsPath('/party/site-settings/tariffs'), true)
  assert.equal(isPartySiteSettingsPath('/company/settings'), false)
})
