const DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS = Object.freeze({
  useDefault: false,
  overrides: Object.freeze([
    Object.freeze({ method: 'popup', minutes: 60 }),
    Object.freeze({ method: 'popup', minutes: 1440 }),
  ]),
})

const DEFAULT_PARTY_GOOGLE_CALENDAR_STATUS_COLORS = Object.freeze({
  draft: '8',
  active: '9',
  canceled: '11',
  closed: '10',
})

const DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS = Object.freeze({
  titleMode: 'eventType_services',
  showDescription: true,
  showClient: true,
  showLocation: true,
  showServices: true,
  showStaff: true,
  showContractSum: true,
  showPayments: true,
  showTransactions: true,
  showPayouts: true,
  showAdditionalEvents: true,
  showNavigationLinks: true,
  showOrderLink: true,
  showStatusIcons: true,
})

const PARTY_GOOGLE_CALENDAR_TITLE_MODES = new Set([
  'eventType_services',
  'services_eventType',
  'eventType',
  'services',
  'client_eventType',
])

const PARTY_GOOGLE_CALENDAR_SYNC_ERRORS = new Set([
  '',
  'calendar_sync_unavailable',
  'calendar_sync_failed',
  'reconnect_required',
])

const createDefaultReminders = () => ({
  useDefault: DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS.useDefault,
  overrides: DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS.overrides.map((item) => ({
    ...item,
  })),
})

const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeEmail = (value) => normalizeString(value).toLowerCase()

const normalizeDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

const normalizeExpiryDate = (value) => {
  if (value === null || value === undefined || value === '') return null
  const prepared = Number(value)
  return Number.isFinite(prepared) ? prepared : null
}

const normalizeReminders = (value) => {
  if (!value || typeof value !== 'object') {
    return createDefaultReminders()
  }
  const useDefault = value.useDefault === true
  const overrides = Array.isArray(value.overrides)
    ? value.overrides
        .filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item.method === 'popup' || item.method === 'email') &&
            Number.isFinite(Number(item.minutes)) &&
            Number(item.minutes) > 0
        )
        .map((item) => ({
          method: item.method,
          minutes: Number(item.minutes),
        }))
    : []

  if (!useDefault && overrides.length === 0) {
    return createDefaultReminders()
  }
  return { useDefault, overrides }
}

const normalizeStatusColors = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const normalizeColor = (color, fallback) => {
    const prepared = normalizeString(String(color ?? ''))
    return /^(?:[1-9]|1[0-1])$/.test(prepared) ? prepared : fallback
  }
  return Object.fromEntries(
    Object.entries(DEFAULT_PARTY_GOOGLE_CALENDAR_STATUS_COLORS).map(
      ([status, fallback]) => [status, normalizeColor(source[status], fallback)]
    )
  )
}

const normalizeSyncSettings = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const settings = {
    titleMode: PARTY_GOOGLE_CALENDAR_TITLE_MODES.has(source.titleMode)
      ? source.titleMode
      : DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS.titleMode,
  }
  for (const [key, defaultValue] of Object.entries(
    DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS
  )) {
    if (key === 'titleMode') continue
    settings[key] =
      typeof source[key] === 'boolean' ? source[key] : defaultValue
  }
  return settings
}

const normalizePartyGoogleCalendarSettings = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {}
  const lastSyncError = normalizeString(source.lastSyncError)
  return {
    enabled: source.enabled === true,
    accessToken: normalizeString(source.accessToken),
    refreshToken: normalizeString(source.refreshToken),
    tokenType: normalizeString(source.tokenType),
    scope: normalizeString(source.scope),
    expiryDate: normalizeExpiryDate(source.expiryDate),
    connectedEmail: normalizeEmail(source.connectedEmail),
    connectedByUserId: normalizeString(source.connectedByUserId),
    connectedAt: normalizeDate(source.connectedAt),
    updatedAt: normalizeDate(source.updatedAt),
    calendarId: normalizeString(source.calendarId),
    calendarName: normalizeString(source.calendarName),
    reminders: normalizeReminders(source.reminders),
    statusColors: normalizeStatusColors(source.statusColors),
    syncSettings: normalizeSyncSettings(source.syncSettings),
    deleteCanceledFromCalendar: source.deleteCanceledFromCalendar === true,
    lastSyncAt: normalizeDate(source.lastSyncAt),
    lastSyncError: PARTY_GOOGLE_CALENDAR_SYNC_ERRORS.has(lastSyncError)
      ? lastSyncError
      : '',
  }
}

const toPublicPartyGoogleCalendarStatus = ({
  settings,
  allowCalendarSync,
} = {}) => {
  const normalized = normalizePartyGoogleCalendarSettings(settings)
  return {
    connected: Boolean(normalized.refreshToken || normalized.accessToken),
    enabled: normalized.enabled,
    calendarId: normalized.calendarId,
    calendarName: normalized.calendarName,
    email: normalized.connectedEmail,
    settings: {
      reminders: normalized.reminders,
      statusColors: normalized.statusColors,
      syncSettings: normalized.syncSettings,
      deleteCanceledFromCalendar: normalized.deleteCanceledFromCalendar,
    },
    diagnostics: {
      connectedAt: normalized.connectedAt,
      updatedAt: normalized.updatedAt,
      lastSyncAt: normalized.lastSyncAt,
      lastSyncError: normalized.lastSyncError,
    },
    allowCalendarSync: allowCalendarSync === true,
  }
}

const mergePartyGoogleCalendarCredentials = ({
  settings,
  tokens,
  email,
  connectedByUserId,
  now = new Date(),
} = {}) => {
  const current = normalizePartyGoogleCalendarSettings(settings)
  const sourceTokens = tokens && typeof tokens === 'object' ? tokens : {}
  const timestamp = normalizeDate(now)
  const nextStringCredential = (value, fallback) =>
    normalizeString(value) || fallback
  const nextExpiryDate = normalizeExpiryDate(sourceTokens.expiry_date)
  return normalizePartyGoogleCalendarSettings({
    ...current,
    accessToken: nextStringCredential(
      sourceTokens.access_token,
      current.accessToken
    ),
    refreshToken: nextStringCredential(
      sourceTokens.refresh_token,
      current.refreshToken
    ),
    tokenType: nextStringCredential(sourceTokens.token_type, current.tokenType),
    scope: nextStringCredential(sourceTokens.scope, current.scope),
    expiryDate: nextExpiryDate ?? current.expiryDate,
    connectedEmail: email,
    connectedByUserId,
    connectedAt: timestamp,
    updatedAt: timestamp,
  })
}

const serializePartyCompanySettingsForResponse = (
  settings,
  { allowCalendarSync } = {}
) => {
  const source = settings && typeof settings === 'object' ? settings : {}
  return {
    ...source,
    googleCalendar: toPublicPartyGoogleCalendarStatus({
      settings: source.googleCalendar,
      allowCalendarSync,
    }),
  }
}

const preservePartyGoogleCalendarSettings = (currentSettings, nextSettings) => {
  const current =
    currentSettings && typeof currentSettings === 'object' ? currentSettings : {}
  const next = nextSettings && typeof nextSettings === 'object' ? nextSettings : {}
  const protectedSettings = { ...next }
  if (Object.hasOwn(current, 'googleCalendar')) {
    protectedSettings.googleCalendar = current.googleCalendar
  } else {
    delete protectedSettings.googleCalendar
  }
  return protectedSettings
}

export {
  DEFAULT_PARTY_GOOGLE_CALENDAR_REMINDERS,
  DEFAULT_PARTY_GOOGLE_CALENDAR_STATUS_COLORS,
  DEFAULT_PARTY_GOOGLE_CALENDAR_SYNC_SETTINGS,
  mergePartyGoogleCalendarCredentials,
  normalizePartyGoogleCalendarSettings,
  preservePartyGoogleCalendarSettings,
  serializePartyCompanySettingsForResponse,
  toPublicPartyGoogleCalendarStatus,
}
