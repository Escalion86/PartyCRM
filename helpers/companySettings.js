import {
  getAddressPoolSignature,
  normalizeAddressPoolString,
  normalizePartyPoolAddress,
  normalizeTownList,
} from './addressPool.js'

const uniqueBy = (items, getKey) => {
  const seen = new Set()
  const result = []

  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

export const DEFAULT_COMPANY_SETTINGS = Object.freeze({
  timeZone: 'Asia/Krasnoyarsk',
  defaultOrderDurationMinutes: 60,
  towns: [],
  defaultTown: '',
  addresses: [],
  eventTypes: [],
  notifications: {},
  documents: {},
  integrations: {},
})

export const normalizeCompanyEventTypes = (eventTypes = []) =>
  Array.from(
    new Set(
      eventTypes
        .map((item) => normalizeAddressPoolString(item))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

export const normalizeCompanyAddresses = (addresses = []) =>
  uniqueBy(
    addresses
      .map(normalizePartyPoolAddress)
      .filter(
        (item) => item.town || item.street || item.house || item.room || item.comment
      ),
    (item) =>
      getAddressPoolSignature(item, [
        'town',
        'street',
        'house',
        'room',
        'comment',
      ]).toLowerCase()
  )

export const normalizeCompanyTowns = (towns = []) => normalizeTownList(towns)

const normalizeObjectField = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const normalizeDuration = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_COMPANY_SETTINGS.defaultOrderDurationMinutes
  return Math.max(15, parsed)
}

export const normalizeCompanySettings = (value = {}) => ({
  ...DEFAULT_COMPANY_SETTINGS,
  ...value,
  timeZone:
    normalizeAddressPoolString(value?.timeZone) || DEFAULT_COMPANY_SETTINGS.timeZone,
  defaultOrderDurationMinutes: normalizeDuration(value?.defaultOrderDurationMinutes),
  towns: normalizeCompanyTowns(value?.towns ?? []),
  defaultTown: typeof value?.defaultTown === 'string' ? value.defaultTown.trim() : '',
  addresses: normalizeCompanyAddresses(value?.addresses ?? []),
  eventTypes: normalizeCompanyEventTypes(value?.eventTypes ?? []),
  notifications: normalizeObjectField(value?.notifications),
  documents: normalizeObjectField(value?.documents),
  integrations: normalizeObjectField(value?.integrations),
})

export const mergeCompanySettingsPatch = (current, patch) =>
  normalizeCompanySettings({
    ...normalizeCompanySettings(current),
    ...patch,
    notifications: {
      ...normalizeObjectField(current?.notifications),
      ...normalizeObjectField(patch?.notifications),
    },
    documents: {
      ...normalizeObjectField(current?.documents),
      ...normalizeObjectField(patch?.documents),
    },
    integrations: {
      ...normalizeObjectField(current?.integrations),
      ...normalizeObjectField(patch?.integrations),
    },
  })
