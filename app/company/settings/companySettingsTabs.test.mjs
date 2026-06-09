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

test('general tab stays available for admin and regular company user', () => {
  assert.equal(canAccessCompanySettingsTab('general', 'user'), true)
  assert.equal(canAccessCompanySettingsTab('general', 'admin'), true)
  assert.equal(canAccessCompanySettingsTab('general', 'dev'), true)
})

test('dev-only marker config can be added without affecting admin-dev items', () => {
  const adminTabs = getVisibleCompanySettingsTabs('admin')
  const hasDevAccess = adminTabs.some((item) => item.access === 'dev')
  assert.equal(hasDevAccess, false, 'admin should not see dev-only tabs')
})

test('all admin-dev tabs are hidden for regular user', () => {
  const userTabs = getVisibleCompanySettingsTabs('user')
  const adminDevTabs = userTabs.filter(
    (item) => item.access === 'admin-dev'
  )
  assert.equal(adminDevTabs.length, 0, 'user should not see any admin-dev tabs')
})

test('company owner sees company management tabs without global admin role', () => {
  const ownerAccess = { globalRole: 'user', companyRole: 'owner' }

  assert.equal(canAccessCompanySettingsTab('integrations', ownerAccess), true)
  assert.equal(canAccessCompanySettingsTab('documents', ownerAccess), true)
  assert.equal(canAccessCompanySettingsTab('tariffs', ownerAccess), true)

  assert.deepEqual(
    getVisibleCompanySettingsTabs(ownerAccess).map((item) => item.slug),
    ['general', 'integrations', 'lists', 'notifications', 'documents', 'tariffs']
  )
})

test('company performer does not see company management tabs', () => {
  const performerAccess = { globalRole: 'user', companyRole: 'performer' }

  assert.equal(canAccessCompanySettingsTab('tariffs', performerAccess), false)

  assert.deepEqual(
    getVisibleCompanySettingsTabs(performerAccess).map((item) => item.slug),
    ['general', 'lists']
  )
})
