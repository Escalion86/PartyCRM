const cleanText = (value, maxLength = 500) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : ''
}

const readHeader = (req, key) => {
  const headers = req?.headers
  if (!headers) return ''
  if (typeof headers.get === 'function') return cleanText(headers.get(key), 256)
  return cleanText(headers[key], 256)
}

export const normalizePartyPhone = (value) =>
  String(value ?? '').replace(/\D/g, '')

export const normalizePartyPublicLeadApiKeys = (settings = {}) => {
  const configured = Array.isArray(settings.publicLeadApiKeys)
    ? settings.publicLeadApiKeys
        .map((item) => ({
          id: cleanText(item?.id, 80),
          name: cleanText(item?.name, 120),
          key: cleanText(item?.key, 256),
          enabled: item?.enabled !== false,
        }))
        .filter((item) => item.key)
    : []

  const legacyKey = cleanText(settings.publicLeadApiKey, 256)
  if (
    legacyKey &&
    !configured.some((item) => String(item.key) === String(legacyKey))
  ) {
    configured.push({
      id: 'legacy',
      name: 'Основной API',
      key: legacyKey,
      enabled: true,
    })
  }

  return configured
}

export const getPartyPublicLeadApiKey = (req, body = {}) =>
  cleanText(
    readHeader(req, 'x-partycrm-api-key') ||
      readHeader(req, 'x-public-api-key') ||
      readHeader(req, 'x-api-key') ||
      body.apiKey ||
      body.api_key,
    256
  )

const parseDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseMoney = (value) => {
  if (value === null || value === undefined || value === '') return 0
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

export const normalizePartyPublicLeadPayload = (body = {}) => ({
  clientName: cleanText(
    body.clientName || body.name || body.fullName || body.contactName,
    160
  ),
  phone: normalizePartyPhone(body.phone || body.clientPhone || body.tel),
  whatsapp: normalizePartyPhone(body.whatsapp || body.whatsApp),
  telegram: cleanText(body.telegram, 120),
  email: cleanText(body.email, 160).toLowerCase(),
  eventDate: parseDate(body.eventDate || body.date || body.datetime),
  dateEnd: parseDate(body.dateEnd || body.endDate),
  town: cleanText(body.town || body.city, 120),
  address: cleanText(body.address || body.place, 500),
  comment: cleanText(body.comment || body.message || body.description, 2000),
  source: cleanText(body.source || body.utm_source || 'public_api', 120),
  serviceTitle: cleanText(body.serviceTitle || body.service || body.product, 180),
  serviceId: cleanText(body.serviceId, 80),
  locationId: cleanText(body.locationId || body.location, 80),
  locationTitle: cleanText(body.locationTitle || body.placeTitle, 180),
  contractAmount: parseMoney(
    body.contractAmount || body.amount || body.price || body.payment
  ),
})

export const normalizePartyTildaLeadPayload = (body = {}) =>
  normalizePartyPublicLeadPayload({
    ...body,
    name: body.Name || body.name || body['Имя'],
    phone: body.Phone || body.phone || body['Телефон'],
    email: body.Email || body.email || body['Email'],
    date: body.Date || body.date || body['Дата'],
    service: body.Service || body.service || body['Услуга'],
    payment: body.Payment || body.payment || body.price || body['Сумма'],
    comment: body.Comment || body.comment || body.Message || body.message,
    source: 'Tilda',
  })

const normalizeComparable = (value) => cleanText(value, 240).toLowerCase()

const readId = (item) => cleanText(item?._id?.toString?.() ?? item?._id, 80)

const isActiveRouteTarget = (item) =>
  !item?.status || String(item.status) === 'active'

const buildLookup = (items = []) => {
  const byId = new Map()
  const byTitle = new Map()

  for (const item of Array.isArray(items) ? items : []) {
    if (!isActiveRouteTarget(item)) continue
    const id = readId(item)
    if (id) byId.set(id, item)
    const title = normalizeComparable(item?.title)
    if (title && !byTitle.has(title)) byTitle.set(title, item)
  }

  return { byId, byTitle }
}

const normalizeRoutingRule = (item = {}) => ({
  id: cleanText(item.id, 80),
  source: cleanText(item.source, 120),
  matchLocationTitle: cleanText(item.matchLocationTitle, 180),
  matchServiceTitle: cleanText(item.matchServiceTitle, 180),
  locationId: cleanText(item.locationId, 80),
  serviceId: cleanText(item.serviceId, 80),
  enabled: item.enabled !== false,
})

const getRoutingRules = (settings = {}) =>
  Array.isArray(settings.publicLeadRoutingRules)
    ? settings.publicLeadRoutingRules
        .map(normalizeRoutingRule)
        .filter(
          (rule) =>
            rule.enabled &&
            (rule.locationId ||
              rule.serviceId ||
              rule.source ||
              rule.matchLocationTitle ||
              rule.matchServiceTitle)
        )
    : []

const matchesRuleValue = (expected, actual) =>
  !expected || normalizeComparable(expected) === normalizeComparable(actual)

const findExplicitIdRouting = ({ normalized, locationsLookup, servicesLookup }) => {
  const location = locationsLookup.byId.get(normalized.locationId) || null
  const service = servicesLookup.byId.get(normalized.serviceId) || null

  if (!location && !service) return null

  return {
    location,
    service,
    matchedBy: 'explicit',
    ruleId: '',
  }
}

const findTitleRouting = ({ normalized, locationsLookup, servicesLookup }) => {
  const location =
    locationsLookup.byTitle.get(normalizeComparable(normalized.locationTitle)) ||
    null
  const service =
    servicesLookup.byTitle.get(normalizeComparable(normalized.serviceTitle)) ||
    null

  if (!location && !service) return null

  return {
    location,
    service,
    matchedBy: 'title',
    ruleId: '',
  }
}

const findRuleRouting = ({
  normalized,
  settings,
  locationsLookup,
  servicesLookup,
}) => {
  for (const rule of getRoutingRules(settings)) {
    if (!matchesRuleValue(rule.source, normalized.source)) continue
    if (
      !matchesRuleValue(rule.matchLocationTitle, normalized.locationTitle)
    ) {
      continue
    }
    if (!matchesRuleValue(rule.matchServiceTitle, normalized.serviceTitle)) {
      continue
    }

    const location = locationsLookup.byId.get(rule.locationId) || null
    const service = servicesLookup.byId.get(rule.serviceId) || null
    if (!location && !service) continue

    return {
      location,
      service,
      matchedBy: 'rule',
      ruleId: rule.id,
    }
  }

  return null
}

export const resolvePartyPublicLeadRouting = ({
  normalized = {},
  settings = {},
  locations = [],
  services = [],
} = {}) => {
  const locationsLookup = buildLookup(locations)
  const servicesLookup = buildLookup(services)
  const matched =
    findExplicitIdRouting({ normalized, locationsLookup, servicesLookup }) ||
    findRuleRouting({ normalized, settings, locationsLookup, servicesLookup }) ||
    findTitleRouting({ normalized, locationsLookup, servicesLookup })

  const locationId = matched?.location ? readId(matched.location) : null
  const serviceId = matched?.service ? readId(matched.service) : ''
  const hasAddress = Boolean(normalized?.town || normalized?.address)
  const serviceTitle = matched?.service?.title || normalized.serviceTitle

  return {
    locationId,
    servicesIds: serviceId ? [serviceId] : [],
    serviceTitle,
    placeType: locationId || !hasAddress ? 'company_location' : 'client_address',
    routing: {
      matchedBy: matched?.matchedBy || 'fallback',
      ruleId: matched?.ruleId || '',
      locationId: locationId || '',
      serviceId,
    },
  }
}

export const buildPartyPublicLeadOrderPayload = ({
  clientId,
  normalized,
  apiKeyData = null,
  rawPayload = {},
  routing = null,
} = {}) => {
  const hasAddress = Boolean(normalized?.town || normalized?.address)
  const sourceLabel = cleanText(apiKeyData?.name, 120) || normalized.source
  const resolvedRouting =
    routing ||
    resolvePartyPublicLeadRouting({
      normalized,
    })

  return {
    title: resolvedRouting.serviceTitle || 'Новая заявка',
    status: 'draft',
    clientId,
    client: {
      name: normalized.clientName,
      phone: normalized.phone,
      email: normalized.email,
    },
    eventDate: normalized.eventDate,
    dateEnd: normalized.dateEnd,
    placeType:
      resolvedRouting.placeType ||
      (hasAddress ? 'client_address' : 'company_location'),
    locationId: resolvedRouting.locationId,
    customAddress: normalized.address,
    clientAddress: {
      town: normalized.town,
      street: '',
      house: '',
      room: '',
      comment: normalized.address,
    },
    servicesIds: resolvedRouting.servicesIds,
    serviceTitle: resolvedRouting.serviceTitle,
    contractAmount: normalized.contractAmount,
    transactions: [],
    additionalEvents: [],
    clientPayment: {
      totalAmount: normalized.contractAmount,
      prepaidAmount: 0,
      status: normalized.contractAmount > 0 ? 'wait_prepayment' : 'none',
    },
    assignedStaff: [],
    adminComment: normalized.comment,
    leadSource: normalized.source,
    leadSourceLabel: sourceLabel,
    leadMeta: {
      createdViaApi: true,
      apiKeyId: cleanText(apiKeyData?.id, 80),
      apiKeyName: cleanText(apiKeyData?.name, 120),
      routing: resolvedRouting.routing,
      raw: rawPayload,
    },
  }
}
