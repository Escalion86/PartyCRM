const PHONE_FIELDS = ['phone', 'whatsapp', 'viber']
const TEXT_FIELDS = ['email', 'telegram', 'vk', 'instagram']

const REASON_SCORES = Object.freeze({
  phone: 100,
  whatsapp: 95,
  viber: 90,
  email: 90,
  telegram: 65,
  vk: 60,
  instagram: 55,
})

const normalizePhone = (value) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/[^\d]/g, '')
    : ''

const normalizeMessenger = (value) => {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/^(t\.me\/|telegram\.me\/|vk\.com\/|instagram\.com\/)/, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
}

export const normalizePartyClientDedupeInput = (input = {}) => ({
  phone: normalizePhone(input.phone),
  whatsapp: normalizePhone(input.whatsapp),
  viber: normalizePhone(input.viber),
  email: typeof input.email === 'string' ? input.email.trim().toLowerCase() : '',
  telegram: normalizeMessenger(input.telegram),
  vk: normalizeMessenger(input.vk),
  instagram: normalizeMessenger(input.instagram),
})

const collectInputPhones = (input) =>
  new Set(PHONE_FIELDS.map((field) => input[field]).filter(Boolean))

const matchClient = ({ input, client }) => {
  const normalizedClient = normalizePartyClientDedupeInput(client)
  const inputPhones = collectInputPhones(input)
  const reasons = []

  for (const field of PHONE_FIELDS) {
    if (normalizedClient[field] && inputPhones.has(normalizedClient[field])) {
      reasons.push(field)
    }
  }

  for (const field of TEXT_FIELDS) {
    if (input[field] && normalizedClient[field] === input[field]) {
      reasons.push(field)
    }
  }

  const score = reasons.reduce(
    (sum, reason) => sum + (REASON_SCORES[reason] ?? 1),
    0
  )

  return { reasons, score }
}

export const findSimilarPartyClients = ({
  tenantId,
  input,
  clients = [],
  excludeClientId = '',
  limit = 5,
}) => {
  const normalizedInput = normalizePartyClientDedupeInput(input)
  const hasSearchValue = [...PHONE_FIELDS, ...TEXT_FIELDS].some(
    (field) => normalizedInput[field]
  )
  if (!tenantId || !hasSearchValue) return []

  return clients
    .filter((client) => {
      if (!client?._id) return false
      if (excludeClientId && String(client._id) === String(excludeClientId)) {
        return false
      }
      if (String(client.tenantId || '') !== String(tenantId)) return false
      return client.status !== 'archived'
    })
    .map((client) => ({
      client,
      ...matchClient({ input: normalizedInput, client }),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export const buildPartyClientSimilarMongoFilter = ({
  tenantId,
  input,
  excludeClientId = '',
}) => {
  const normalizedInput = normalizePartyClientDedupeInput(input)
  const phoneValues = [...collectInputPhones(normalizedInput)]
  const or = []

  for (const phone of phoneValues) {
    or.push({ phone }, { whatsapp: phone }, { viber: phone })
  }
  for (const field of TEXT_FIELDS) {
    if (normalizedInput[field]) or.push({ [field]: normalizedInput[field] })
  }

  if (or.length === 0) return null

  return {
    tenantId,
    status: { $ne: 'archived' },
    ...(excludeClientId ? { _id: { $ne: excludeClientId } } : {}),
    $or: or,
  }
}
