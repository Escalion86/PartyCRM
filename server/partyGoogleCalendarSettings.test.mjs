import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS,
  DEFAULT_PARTY_GOOGLE_CALENDAR_STATUS_COLORS,
  DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS,
  mergePartyGoogleCalendarCredentials,
  normalizePartyGoogleCalendarSettings,
  preservePartyGoogleCalendarSettings,
  serializePartyCompanySettingsForResponse,
  toPublicPartyGoogleCalendarStatus,
} from './partyGoogleCalendarSettings.js'

test('normalizePartyGoogleCalendarSettings returns PartyCRM defaults', () => {
  const settings = normalizePartyGoogleCalendarSettings()

  assert.deepEqual(settings.reminders, DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS)
  assert.deepEqual(
    settings.statusColors,
    DEFAULT_PARTY_GOOGLE_CALENDAR_STATUS_COLORS
  )
  assert.deepEqual(
    settings.syncSettings,
    DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS
  )
})

test('normalizePartyGoogleCalendarSettings returns fresh nested defaults', () => {
  const first = normalizePartyGoogleCalendarSettings()
  const second = normalizePartyGoogleCalendarSettings()

  assert.notEqual(first.reminders, second.reminders)
  assert.notEqual(first.reminders.overrides, second.reminders.overrides)
  assert.notEqual(first.reminders.overrides[0], second.reminders.overrides[0])
  assert.notEqual(first.statusColors, second.statusColors)
  assert.notEqual(first.syncSettings, second.syncSettings)
  assert.notEqual(first.reminders, DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS)
})

test('normalizePartyGoogleCalendarSettings rejects invalid reminders, colors, and title mode', () => {
  const settings = normalizePartyGoogleCalendarSettings({
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'sms', minutes: 10 },
        { method: 'popup', minutes: 0 },
      ],
    },
    statusColors: {
      draft: '0',
      active: '12',
      canceled: 'red',
      closed: '3',
    },
    syncSettings: { titleMode: 'unsafe' },
  })

  assert.deepEqual(settings.reminders, DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS)
  assert.deepEqual(settings.statusColors, {
    ...DEFAULT_PARTY_GOOGLE_CALENDAR_STATUS_COLORS,
    closed: '3',
  })
  assert.equal(
    settings.syncSettings.titleMode,
    DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS.titleMode
  )
})

test('normalizePartyGoogleCalendarSettings accepts only boolean true for enabled', () => {
  assert.equal(normalizePartyGoogleCalendarSettings({ enabled: true }).enabled, true)
  assert.equal(normalizePartyGoogleCalendarSettings({ enabled: 1 }).enabled, false)
  assert.equal(
    normalizePartyGoogleCalendarSettings({ enabled: 'true' }).enabled,
    false
  )
})

test('normalizePartyGoogleCalendarSettings normalizes credentials, metadata, and diagnostics', () => {
  const settings = normalizePartyGoogleCalendarSettings({
    enabled: true,
    accessToken: 123,
    refreshToken: ' refresh ',
    tokenType: ' Bearer ',
    scope: ' calendar ',
    expiryDate: '1700000000000',
    connectedEmail: ' USER@EXAMPLE.COM ',
    connectedByUserId: 42,
    connectedAt: '2026-06-13T10:00:00.000Z',
    updatedAt: 'invalid',
    calendarId: ' primary ',
    calendarName: ' Work ',
    deleteCanceledFromCalendar: true,
    lastSyncAt: '2026-06-13T11:00:00.000Z',
    lastSyncError: 'unknown',
  })

  assert.equal(settings.enabled, true)
  assert.equal(settings.accessToken, '')
  assert.equal(settings.refreshToken, 'refresh')
  assert.equal(settings.tokenType, 'Bearer')
  assert.equal(settings.scope, 'calendar')
  assert.equal(settings.expiryDate, 1700000000000)
  assert.equal(settings.connectedEmail, 'user@example.com')
  assert.equal(settings.connectedByUserId, '')
  assert.equal(settings.connectedAt, '2026-06-13T10:00:00.000Z')
  assert.equal(settings.updatedAt, null)
  assert.equal(settings.calendarId, 'primary')
  assert.equal(settings.calendarName, 'Work')
  assert.equal(settings.deleteCanceledFromCalendar, true)
  assert.equal(settings.lastSyncAt, '2026-06-13T11:00:00.000Z')
  assert.equal(settings.lastSyncError, '')
})

test('toPublicPartyGoogleCalendarStatus omits tokens and reports connection by either token', () => {
  const status = toPublicPartyGoogleCalendarStatus({
    settings: {
      enabled: true,
      accessToken: 'access-secret',
      refreshToken: '',
      connectedEmail: 'user@example.com',
      calendarId: 'primary',
      calendarName: 'Main',
      lastSyncError: 'reconnect_required',
    },
    allowCalendarSync: false,
  })

  assert.equal(status.connected, true)
  assert.equal(status.allowCalendarSync, false)
  assert.equal(status.email, 'user@example.com')
  assert.equal(status.calendarId, 'primary')
  assert.equal(status.calendarName, 'Main')
  assert.equal(status.diagnostics.lastSyncError, 'reconnect_required')
  assert.equal(Object.hasOwn(status, 'accessToken'), false)
  assert.equal(Object.hasOwn(status, 'refreshToken'), false)
  assert.equal(JSON.stringify(status).includes('access-secret'), false)
})

test('mergePartyGoogleCalendarCredentials preserves existing refresh token', () => {
  const merged = mergePartyGoogleCalendarCredentials({
    settings: {
      refreshToken: 'existing-refresh',
      calendarId: 'primary',
    },
    tokens: {
      access_token: 'new-access',
      token_type: 'Bearer',
      scope: 'calendar',
      expiry_date: 1700000000000,
    },
    email: 'user@example.com',
    connectedByUserId: 'user-1',
    now: new Date('2026-06-13T12:00:00.000Z'),
  })

  assert.equal(merged.refreshToken, 'existing-refresh')
  assert.equal(merged.accessToken, 'new-access')
  assert.equal(merged.connectedByUserId, 'user-1')
  assert.equal(merged.connectedAt, '2026-06-13T12:00:00.000Z')
  assert.equal(merged.updatedAt, '2026-06-13T12:00:00.000Z')
  assert.equal(merged.calendarId, 'primary')
})

test('mergePartyGoogleCalendarCredentials preserves all credentials for empty partial response', () => {
  const merged = mergePartyGoogleCalendarCredentials({
    settings: {
      accessToken: 'existing-access',
      refreshToken: 'existing-refresh',
      tokenType: 'Bearer',
      scope: 'existing-scope',
      expiryDate: 1700000000000,
    },
    tokens: {
      access_token: '   ',
      refresh_token: '   ',
      token_type: '',
      scope: null,
      expiry_date: '',
    },
    now: new Date('2026-06-13T12:00:00.000Z'),
  })

  assert.equal(merged.accessToken, 'existing-access')
  assert.equal(merged.refreshToken, 'existing-refresh')
  assert.equal(merged.tokenType, 'Bearer')
  assert.equal(merged.scope, 'existing-scope')
  assert.equal(merged.expiryDate, 1700000000000)
})

test('mergePartyGoogleCalendarCredentials replaces credentials with valid new values', () => {
  const merged = mergePartyGoogleCalendarCredentials({
    settings: {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      tokenType: 'Old',
      scope: 'old-scope',
      expiryDate: 1,
    },
    tokens: {
      access_token: ' new-access ',
      refresh_token: ' new-refresh ',
      token_type: ' Bearer ',
      scope: ' new-scope ',
      expiry_date: 1800000000000,
    },
  })

  assert.equal(merged.accessToken, 'new-access')
  assert.equal(merged.refreshToken, 'new-refresh')
  assert.equal(merged.tokenType, 'Bearer')
  assert.equal(merged.scope, 'new-scope')
  assert.equal(merged.expiryDate, 1800000000000)
})

test('serializePartyCompanySettingsForResponse preserves other settings and removes credentials', () => {
  const serialized = serializePartyCompanySettingsForResponse(
    {
      towns: ['Москва'],
      notifications: { pushEnabled: true },
      googleCalendar: {
        enabled: true,
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        connectedEmail: 'user@example.com',
        calendarId: 'primary',
      },
    },
    { allowCalendarSync: true }
  )

  assert.deepEqual(serialized.towns, ['Москва'])
  assert.deepEqual(serialized.notifications, { pushEnabled: true })
  assert.equal(serialized.googleCalendar.connected, true)
  assert.equal(serialized.googleCalendar.email, 'user@example.com')
  assert.equal(serialized.googleCalendar.allowCalendarSync, true)
  assert.equal(
    Object.hasOwn(serialized.googleCalendar, 'accessToken'),
    false
  )
  assert.equal(
    Object.hasOwn(serialized.googleCalendar, 'refreshToken'),
    false
  )
  assert.equal(JSON.stringify(serialized).includes('access-secret'), false)
  assert.equal(JSON.stringify(serialized).includes('refresh-secret'), false)
})

test('serializePartyCompanySettingsForResponse supports partial settings', () => {
  const serialized = serializePartyCompanySettingsForResponse(
    { timeZone: 'Europe/Moscow' },
    { allowCalendarSync: false }
  )

  assert.equal(serialized.timeZone, 'Europe/Moscow')
  assert.equal(serialized.googleCalendar.connected, false)
  assert.equal(serialized.googleCalendar.allowCalendarSync, false)
})

test('preservePartyGoogleCalendarSettings keeps persisted settings from generic patch', () => {
  const current = {
    googleCalendar: { refreshToken: 'secret', enabled: true },
    notifications: { pushEnabled: true },
  }
  const patched = {
    googleCalendar: { refreshToken: 'attacker', enabled: false },
    notifications: { pushEnabled: false },
  }

  assert.deepEqual(preservePartyGoogleCalendarSettings(current, patched), {
    googleCalendar: { refreshToken: 'secret', enabled: true },
    notifications: { pushEnabled: false },
  })
})
