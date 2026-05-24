import { google } from 'googleapis'
import { DEFAULT_GOOGLE_CALENDAR_REMINDERS } from '@helpers/constants'

const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar'
const DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS = Object.freeze({
  draft: '8',
  active: '9',
  canceled: '11',
  closed: '10',
})

const DEFAULT_GOOGLE_CALENDAR_SYNC_SETTINGS = Object.freeze({
  titleMode: 'eventType_services',
  showDescription: true,
  showClient: true,
  showOtherContacts: true,
  showColleague: true,
  showContractSum: true,
  showFinanceComment: true,
  showTransactions: true,
  showAdditionalEvents: true,
  showNavigationLinks: true,
  showEventLink: true,
})

const GOOGLE_CALENDAR_TITLE_MODES = new Set([
  'eventType_services',
  'services_eventType',
  'eventType',
  'services',
  'eventTitle',
  'client_eventType',
])

const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) return null
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

const normalizeCalendarReminders = (value) => {
  if (!value || typeof value !== 'object') return DEFAULT_GOOGLE_CALENDAR_REMINDERS
  const useDefault = Boolean(value.useDefault)
  const overrides = Array.isArray(value.overrides)
    ? value.overrides
        .filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item.method === 'email' || item.method === 'popup') &&
            Number.isFinite(Number(item.minutes)) &&
            Number(item.minutes) > 0
        )
        .map((item) => ({
          method: item.method,
          minutes: Number(item.minutes),
        }))
    : []

  if (!useDefault && overrides.length === 0) return DEFAULT_GOOGLE_CALENDAR_REMINDERS
  return {
    useDefault,
    overrides,
  }
}

const normalizeCalendarStatusColors = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const normalizeColorId = (colorId, fallback) => {
    const prepared = String(colorId ?? '').trim()
    return /^(?:[1-9]|1[0-1])$/.test(prepared) ? prepared : fallback
  }
  return {
    draft: normalizeColorId(source.draft, DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.draft),
    active: normalizeColorId(source.active, DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.active),
    canceled: normalizeColorId(source.canceled, DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.canceled),
    closed: normalizeColorId(source.closed, DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS.closed),
  }
}

const normalizeCalendarSyncSettings = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const titleMode = GOOGLE_CALENDAR_TITLE_MODES.has(source.titleMode)
    ? source.titleMode
    : DEFAULT_GOOGLE_CALENDAR_SYNC_SETTINGS.titleMode
  const boolValue = (key) =>
    Boolean(source[key] ?? DEFAULT_GOOGLE_CALENDAR_SYNC_SETTINGS[key])
  return {
    titleMode,
    showDescription: boolValue('showDescription'),
    showClient: boolValue('showClient'),
    showOtherContacts: boolValue('showOtherContacts'),
    showColleague: boolValue('showColleague'),
    showContractSum: boolValue('showContractSum'),
    showFinanceComment: boolValue('showFinanceComment'),
    showTransactions: boolValue('showTransactions'),
    showAdditionalEvents: boolValue('showAdditionalEvents'),
    showNavigationLinks: boolValue('showNavigationLinks'),
    showEventLink: boolValue('showEventLink'),
  }
}

const normalizeCalendarSettings = (user) => {
  const settings = user?.googleCalendar ?? {}
  const deleteCanceledFromCalendar =
    settings?.deleteCanceledFromCalendar === true
  return {
    enabled: Boolean(settings.enabled),
    calendarId: settings.calendarId || '',
    calendarName: settings.calendarName || '',
    refreshToken: settings.refreshToken || '',
    accessToken: settings.accessToken || '',
    tokenExpiry: settings.tokenExpiry || null,
    scope: settings.scope || '',
    syncToken: settings.syncToken || '',
    connectedAt: settings.connectedAt || null,
    email: settings.email || '',
    reminders: normalizeCalendarReminders(settings.reminders),
    statusColors: normalizeCalendarStatusColors(settings.statusColors),
    syncSettings: normalizeCalendarSyncSettings(settings.syncSettings),
    deleteCanceledFromCalendar,
  }
}

const getUserOAuthClient = (user) => {
  const oauth = getOAuthClient()
  if (!oauth || !user) return null
  const settings = normalizeCalendarSettings(user)
  if (!settings.refreshToken) return null
  oauth.setCredentials({
    refresh_token: settings.refreshToken,
    access_token: settings.accessToken || undefined,
    expiry_date: settings.tokenExpiry
      ? new Date(settings.tokenExpiry).getTime()
      : undefined,
    scope: settings.scope || undefined,
  })
  return oauth
}

const getUserCalendarClient = (user) => {
  const auth = getUserOAuthClient(user)
  if (!auth) return null
  return google.calendar({ version: 'v3', auth })
}

const listUserCalendars = async (user) => {
  const calendar = getUserCalendarClient(user)
  if (!calendar) return []
  const response = await calendar.calendarList.list()
  const items = Array.isArray(response?.data?.items) ? response.data.items : []
  return items.map((item) => ({
    id: item.id,
    summary: item.summary,
    primary: Boolean(item.primary),
    accessRole: item.accessRole,
  }))
}

const getUserCalendarId = (user) => {
  const settings = normalizeCalendarSettings(user)
  return settings.calendarId || 'primary'
}

export {
  READ_SCOPE,
  WRITE_SCOPE,
  getOAuthClient,
  getUserOAuthClient,
  getUserCalendarClient,
  listUserCalendars,
  normalizeCalendarReminders,
  normalizeCalendarStatusColors,
  normalizeCalendarSyncSettings,
  normalizeCalendarSettings,
  getUserCalendarId,
  DEFAULT_GOOGLE_CALENDAR_STATUS_COLORS,
  DEFAULT_GOOGLE_CALENDAR_SYNC_SETTINGS,
}
