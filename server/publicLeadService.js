import SiteSettings from '@models/SiteSettings'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Histories from '@models/Histories'
import getUserTariffAccess from '@server/getUserTariffAccess'

const readCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeText = (value, maxLength = 500) => {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  return text.slice(0, maxLength)
}

const normalizePublicLeadApiKeys = (custom) => {
  const items = readCustomValue(custom, 'publicLeadApiKeys')
  const normalized = Array.isArray(items)
    ? items
        .map((item) => ({
          id: normalizeText(item?.id, 80),
          name: normalizeText(item?.name, 120),
          key: normalizeText(item?.key, 256),
          enabled: item?.enabled !== false,
        }))
        .filter((item) => item.key)
    : []

  const legacyKey = normalizeText(readCustomValue(custom, 'publicLeadApiKey'), 256)
  if (
    legacyKey &&
    !normalized.some((item) => String(item.key) === String(legacyKey))
  ) {
    normalized.unshift({
      id: 'legacy',
      name: 'Основной API',
      key: legacyKey,
      enabled: true,
    })
  }

  return normalized
}

const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '')

const parseDateValue = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const normalizeServicesIds = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeText(item, 64))
    .filter(Boolean)
    .slice(0, 20)
}

const getPublicLeadApiKey = (req, body, allowApiKeyAlias = false) =>
  normalizeText(
    req.headers.get('x-public-api-key') ||
      req.headers.get('x-api-key') ||
      body?.apiKey ||
      (allowApiKeyAlias ? body?.api_key : undefined),
    256
  )

const buildAddress = ({ town, address, comment }) => ({
  town: normalizeText(town, 120),
  street: '',
  house: '',
  entrance: '',
  floor: '',
  flat: '',
  comment: normalizeText(address || comment, 500),
  latitude: '',
  longitude: '',
  link2Gis: '',
  linkYandexNavigator: '',
  link2GisShow: true,
  linkYandexShow: true,
})

const resolvePublicLeadTenant = async (apiKey) => {
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      error: 'API key обязателен',
    }
  }

  const siteSettings = await SiteSettings.findOne({
    $or: [
      { 'custom.publicLeadApiKey': apiKey },
      { 'custom.publicLeadApiKeys.key': apiKey },
    ],
  })
    .select('tenantId custom')
    .lean()

  if (!siteSettings?.tenantId) {
    return {
      ok: false,
      status: 403,
      error: 'Неверный API key',
    }
  }

  const publicLeadEnabled = readCustomValue(
    siteSettings.custom,
    'publicLeadEnabled'
  )
  if (publicLeadEnabled !== true) {
    return {
      ok: false,
      status: 403,
      error: 'Прием заявок через API отключен',
    }
  }

  const apiKeys = normalizePublicLeadApiKeys(siteSettings.custom)
  const apiKeyData = apiKeys.find((item) => item.key === apiKey)
  if (!apiKeyData || apiKeyData.enabled === false) {
    return {
      ok: false,
      status: 403,
      error: 'API key отключен или не найден',
    }
  }

  const tenantId = siteSettings.tenantId
  const access = await getUserTariffAccess(tenantId)
  if (!access?.trialActive && !access?.hasTariff) {
    return {
      ok: false,
      status: 403,
      error: 'Не выбран тариф',
    }
  }

  return {
    ok: true,
    tenantId,
    siteSettings,
    access,
    apiKeyData,
  }
}

const upsertPublicLeadClient = async ({
  tenantId,
  name,
  phone,
  whatsapp,
  telegram,
}) => {
  const phoneDigits = normalizePhone(phone)
  const phoneNumber =
    phoneDigits.length >= 10 ? Number(phoneDigits.slice(-15)) : null

  let client = null
  if (phoneNumber) {
    client = await Clients.findOne({ tenantId, phone: phoneNumber })
  }

  if (!client) {
    client = await Clients.create({
      tenantId,
      firstName: normalizeText(name, 120),
      phone: phoneNumber,
      whatsapp: normalizePhone(whatsapp)
        ? Number(normalizePhone(whatsapp).slice(-15))
        : null,
      telegram: normalizeText(telegram, 120),
      clientType: 'none',
    })
    return client
  }

  const nextName = normalizeText(name, 120)
  const nextTelegram = normalizeText(telegram, 120)
  const nextWhatsapp = normalizePhone(whatsapp)
    ? Number(normalizePhone(whatsapp).slice(-15))
    : null

  let hasChanges = false
  if (nextName && !client.firstName) {
    client.firstName = nextName
    hasChanges = true
  }
  if (nextTelegram && !client.telegram) {
    client.telegram = nextTelegram
    hasChanges = true
  }
  if (nextWhatsapp && !client.whatsapp) {
    client.whatsapp = nextWhatsapp
    hasChanges = true
  }
  if (hasChanges) await client.save()

  return client
}

const createPublicLeadDraftEvent = async ({
  tenantId,
  clientId,
  normalizedData,
  rawPayload,
  historyUserId,
  apiKeyData,
}) => {
  const apiSourceName = normalizeText(apiKeyData?.name, 120)
  const sourceLabel = apiSourceName || normalizedData.source || 'public_api'
  const event = await Events.create({
    tenantId,
    clientId: clientId ?? null,
    status: 'draft',
    requestCreatedAt: new Date(),
    eventDate: normalizedData.eventDate ?? null,
    dateEnd: normalizedData.dateEnd ?? null,
    address: buildAddress({
      town: normalizedData.town,
      address: normalizedData.address,
      comment: normalizedData.comment,
    }),
    servicesIds: normalizedData.servicesIds ?? [],
    contractSum:
      Number(normalizedData.contractSum) > 0
        ? Number(normalizedData.contractSum)
        : 0,
    description: normalizedData.comment ?? '',
    calendarImportChecked: true,
    importedFromCalendar: false,
    additionalEvents: [],
    clientData: {
      source: sourceLabel,
      sourceLabel,
      createdViaApi: true,
      apiKeyId: normalizeText(apiKeyData?.id, 80),
      apiKeyName: apiSourceName,
      lead: {
        ...normalizedData,
        isPublicApi: true,
        sourceLabel,
        apiKeyId: normalizeText(apiKeyData?.id, 80),
        apiKeyName: apiSourceName,
        raw: rawPayload,
      },
    },
  })

  await Histories.create({
    schema: Events.collection.collectionName,
    action: 'add',
    data: [event.toJSON()],
    userId: historyUserId,
  })

  return event
}

export {
  normalizeText,
  normalizePhone,
  normalizePublicLeadApiKeys,
  parseDateValue,
  normalizeServicesIds,
  readCustomValue,
  getPublicLeadApiKey,
  buildAddress,
  resolvePublicLeadTenant,
  upsertPublicLeadClient,
  createPublicLeadDraftEvent,
}

