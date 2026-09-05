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

test('company owner sees all settings tabs without global admin role', () => {
  const ownerAccess = { globalRole: 'user', companyRole: 'owner' }

  assert.equal(canAccessCompanySettingsTab('integrations', ownerAccess), true)
  assert.equal(canAccessCompanySettingsTab('documents', ownerAccess), true)
  assert.equal(canAccessCompanySettingsTab('tariffs', ownerAccess), true)

  assert.deepEqual(
    getVisibleCompanySettingsTabs(ownerAccess).map((item) => item.slug),
    ['general', 'integrations', 'lists', 'notifications', 'documents', 'reports', 'tariffs']
  )
})

test('company admin sees all settings tabs', () => {
  const adminAccess = { globalRole: 'user', companyRole: 'admin' }

  assert.deepEqual(
    getVisibleCompanySettingsTabs(adminAccess).map((item) => item.slug),
    ['general', 'integrations', 'lists', 'notifications', 'documents', 'reports', 'tariffs']
  )
})

test('company performer does not see company settings tabs', () => {
  const performerAccess = { globalRole: 'user', companyRole: 'performer' }

  assert.equal(canAccessCompanySettingsTab('general', performerAccess), false)
  assert.equal(canAccessCompanySettingsTab('tariffs', performerAccess), false)
  assert.deepEqual(getVisibleCompanySettingsTabs(performerAccess), [])
})

test('global admin and dev have no company settings access without membership', () => {
  assert.equal(canAccessCompanySettingsTab('general', 'admin'), false)
  assert.equal(canAccessCompanySettingsTab('integrations', 'dev'), false)
  assert.deepEqual(getVisibleCompanySettingsTabs('admin'), [])
  assert.deepEqual(getVisibleCompanySettingsTabs('dev'), [])
})

test('settings tabs do not use global role access markers', () => {
  const ownerTabs = getVisibleCompanySettingsTabs({ companyRole: 'owner' })
  assert.equal(ownerTabs.length, 7)
  assert.equal(
    ownerTabs.some((item) => ['admin-dev', 'dev'].includes(item.access)),
    false
  )
})
