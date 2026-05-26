import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_COMPANY_SETTINGS_TAB,
  canAccessCompanySettingsTab,
  getCompanySettingsHref,
  getCompanySettingsTab,
  getVisibleCompanySettingsTabs,
} from './companySettingsTabs.js'

test('getCompanySettingsTab returns default tab for empty slug', () => {
  assert.equal(getCompanySettingsTab(''), DEFAULT_COMPANY_SETTINGS_TAB)
})

test('getCompanySettingsTab returns null for unknown slug', () => {
  assert.equal(getCompanySettingsTab('unknown'), null)
})

test('getCompanySettingsHref keeps general tab on root settings route', () => {
  assert.equal(getCompanySettingsHref('general'), '/company/settings')
})

test('admin-dev tabs are hidden for regular users', () => {
  assert.equal(canAccessCompanySettingsTab('integrations', 'user'), false)
  assert.equal(canAccessCompanySettingsTab('documents', 'performer'), false)
})

test('admin-dev tabs are available for admin and dev', () => {
  assert.equal(canAccessCompanySettingsTab('integrations', 'admin'), true)
  assert.equal(canAccessCompanySettingsTab('tariffs', 'dev'), true)
})

test('visible tabs list respects global role', () => {
  assert.deepEqual(
    getVisibleCompanySettingsTabs('user').map((item) => item.slug),
    ['general', 'lists']
  )
  assert.deepEqual(
    getVisibleCompanySettingsTabs('admin').map((item) => item.slug),
    ['general', 'integrations', 'lists', 'notifications', 'documents', 'tariffs']
  )
})
