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
  orderNumberFormat: 'P-{YYYY}-{SEQ}',
  addresses: [],
  eventTypes: [],
  serviceTypes: [],
  preparationStatuses: [],
  leadSources: [],
  paymentMethods: [],
  expenseCategories: [],
  publicLeadEnabled: false,
  publicLeadApiKeys: [],
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

export const normalizeCompanyDictionary = (items = []) =>
  uniqueBy(
    items
      .map((item) => normalizeAddressPoolString(item))
      .filter(Boolean),
    (item) => item.toLowerCase()
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

const REQUISITE_LEGACY_FIELD_MAP = Object.freeze({
  providerStatus: 'artistStatus',
  providerFullName: 'artistFullName',
  providerDisplayName: 'artistName',
  providerInn: 'artistInn',
  providerOgrnip: 'artistOgrnip',
  providerBankName: 'artistBankName',
  providerBik: 'artistBik',
  providerCheckingAccount: 'artistCheckingAccount',
  providerCorrespondentAccount: 'artistCorrespondentAccount',
  providerLegalAddress: 'artistLegalAddress',
})

export const normalizeCompanyDocumentRequisites = (value = {}) => {
  const requisites = normalizeObjectField(value)
  const normalized = { ...requisites }

  for (const [providerKey, legacyKey] of Object.entries(
    REQUISITE_LEGACY_FIELD_MAP
  )) {
    normalized[providerKey] = normalizeAddressPoolString(
      requisites[providerKey] ?? requisites[legacyKey]
    )
  }

  normalized.defaultTown = normalizeAddressPoolString(requisites.defaultTown)

  return normalized
}

export const normalizeCompanyDocuments = (value = {}) => {
  const documents = normalizeObjectField(value)
  return {
    ...documents,
    requisites: normalizeCompanyDocumentRequisites(documents.requisites),
  }
}

export const normalizeCompanyPublicLeadApiKeys = (items = []) =>
  Array.isArray(items)
    ? items
        .map((item) => ({
          id: normalizeAddressPoolString(item?.id).slice(0, 80),
          name: normalizeAddressPoolString(item?.name).slice(0, 120),
          key: normalizeAddressPoolString(item?.key).slice(0, 256),
          enabled: item?.enabled !== false,
        }))
        .filter((item) => item.key)
    : []

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
  orderNumberFormat:
    normalizeAddressPoolString(value?.orderNumberFormat) ||
    DEFAULT_COMPANY_SETTINGS.orderNumberFormat,
  addresses: normalizeCompanyAddresses(value?.addresses ?? []),
  eventTypes: normalizeCompanyEventTypes(value?.eventTypes ?? []),
  serviceTypes: normalizeCompanyDictionary(value?.serviceTypes ?? []),
  preparationStatuses: normalizeCompanyDictionary(
    value?.preparationStatuses ?? []
  ),
  leadSources: normalizeCompanyDictionary(value?.leadSources ?? []),
  paymentMethods: normalizeCompanyDictionary(value?.paymentMethods ?? []),
  expenseCategories: normalizeCompanyDictionary(
    value?.expenseCategories ?? []
  ),
  publicLeadEnabled: value?.publicLeadEnabled === true,
  publicLeadApiKeys: normalizeCompanyPublicLeadApiKeys(
    value?.publicLeadApiKeys ?? []
  ),
  notifications: normalizeObjectField(value?.notifications),
  documents: normalizeCompanyDocuments(value?.documents),
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

export const normalizeCompanyProfile = (value = {}) => ({
  title: normalizeAddressPoolString(value?.title),
  legalTitle: normalizeAddressPoolString(value?.legalTitle),
  phone: normalizeAddressPoolString(value?.phone),
  email: normalizeAddressPoolString(value?.email).toLowerCase(),
})

const TELEPHONY_INTEGRATION_KEYS = new Set([
  'novofonEnabled',
  'novofonApiKey',
  'novofonWebhookSecret',
])

const AI_INTEGRATION_KEYS = new Set([
  'aitunnelKey',
  'aiTranscriptionProvider',
  'aiTranscriptionModel',
  'aiAnalysisProvider',
  'aiAnalysisModel',
])

export const filterCompanySettingsPatchByTariffAccess = (patch = {}, access = {}) => {
  const filtered = { ...patch }

  if (!access.allowDocuments && Object.hasOwn(filtered, 'documents')) {
    delete filtered.documents
  }

  if (filtered.integrations && typeof filtered.integrations === 'object') {
    filtered.integrations = { ...filtered.integrations }

    if (!access.allowTelephony) {
      for (const key of TELEPHONY_INTEGRATION_KEYS) {
        delete filtered.integrations[key]
      }
    }

    if (!access.allowAi) {
      for (const key of AI_INTEGRATION_KEYS) {
        delete filtered.integrations[key]
      }
    }

    if (Object.keys(filtered.integrations).length === 0) {
      delete filtered.integrations
    }
  }

  return filtered
}
