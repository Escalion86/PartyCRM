const participantLimit = 100000
const durationLimit = 10080
const amountLimitKopecks = 100000000000000
const listLimit = 50

const invalid = (message, field) => {
  throw Object.assign(new Error(message), {
    status: 400,
    code: 'partycrm_invalid_service_configuration',
    field,
  })
}

const isRecord = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
const isBlank = (value) =>
  value == null || (typeof value === 'string' && value.trim() === '')

const list = (value, message) => {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > listLimit) invalid(message)
  return value
}

const decimal = (value) => {
  if (typeof value === 'number') return value
  const input = typeof value === 'string' ? value.trim().replace(',', '.') : ''
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(input) ? Number(input) : NaN
}

const integer = (value, min, max, message, field) => {
  const number = decimal(value)
  if (!Number.isSafeInteger(number) || number < min || number > max)
    invalid(message, field)
  return number
}

const kopecks = (value, { signed = false } = {}) => {
  const amount = decimal(value)
  const cents = Math.round(amount * 100)
  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(cents) > amountLimitKopecks ||
    (!signed && amount < 0) ||
    Math.abs(amount * 100 - cents) > 1e-6
  )
    invalid('Укажите сумму с точностью до копеек')
  return cents || 0
}

const optional = (value, parse, fallback = null) =>
  isBlank(value) ? fallback : parse(value)
const price = (value, signed = false) => kopecks(value, { signed }) / 100
const duration = (value, signed = false) =>
  integer(value, signed ? -durationLimit : 0, durationLimit, 'Укажите длительность целым числом минут в пределах семи дней')

const hasValidId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) &&
  !Object.hasOwn(Object.prototype, value)

const normalizeNamedEntry = (value, ids) => {
  if (!isRecord(value) || !hasValidId(value.id) || ids.has(value.id))
    invalid('Идентификаторы настроек услуги должны быть уникальными')
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  if (!title || title.length > 180)
    invalid('Укажите название настройки услуги до 180 символов')
  ids.add(value.id)
  return { id: value.id, title }
}

const normalizeChoices = (value) => {
  const ids = new Set()
  return list(value, 'Допустимо до 50 вариантов или дополнений').map((entry) => ({
    ...normalizeNamedEntry(entry, ids),
    priceDelta: optional(entry.priceDelta, (amount) => price(amount, true), 0),
    durationDelta: optional(entry.durationDelta, (minutes) => duration(minutes, true), 0),
  }))
}

const normalizeParticipantTier = (tier) => {
  if (!isRecord(tier)) invalid('Проверьте диапазон участников')
  const participants = (value, lowerBound = 1) =>
    integer(value, lowerBound, participantLimit, 'Проверьте границы диапазона участников')
  const min = participants(tier.min)
  const max = optional(tier.max, (value) => participants(value, min))
  const includedParticipants = optional(tier.includedParticipants, (value) => participants(value, 0))
  return {
    min,
    max,
    price: optional(tier.price, price),
    durationMinutes: optional(tier.durationMinutes, duration),
    includedParticipants,
    pricePerParticipant: optional(tier.pricePerParticipant, price, 0),
    maxPrice: optional(tier.maxPrice, price),
  }
}

export const normalizePartyServiceConfiguration = (value) => {
  if (value == null) return null
  if (!isRecord(value)) invalid('Проверьте настройки услуги')
  const participantTiers = list(value.participantTiers, 'Допустимо до 50 диапазонов участников')
    .map(normalizeParticipantTier)
    .sort((left, right) => left.min - right.min)
  participantTiers.forEach((tier, index) => {
    if (index && (participantTiers[index - 1].max ?? participantLimit) >= tier.min)
      invalid('Диапазоны участников не должны пересекаться')
  })

  const addons = normalizeChoices(value.addons)
  const groupIds = new Set()
  const optionGroups = list(value.optionGroups, 'Допустимо до 50 списков выбора').map((group) => {
    const fields = normalizeNamedEntry(group, groupIds)
    const options = normalizeChoices(group.options)
    if (!options.length) invalid(`Добавьте варианты в список «${fields.title}»`)
    return { ...fields, required: group.required === true, options }
  })

  return participantTiers.length || addons.length || optionGroups.length
    ? { participantTiers, addons, optionGroups }
    : null
}

export const redactPartyServiceConfigurationPrices = (configuration) => {
  if (!configuration) return null
  const withoutPrice = ({ id, title, durationDelta }) => ({ id, title, durationDelta })
  return {
    participantTiers: configuration.participantTiers.map(({ min, max, includedParticipants, durationMinutes }) =>
      ({ min, max, includedParticipants, durationMinutes })
    ),
    addons: configuration.addons.map(withoutPrice),
    optionGroups: configuration.optionGroups.map(({ id, title, required, options }) =>
      ({ id, title, required, options: options.map(withoutPrice) })
    ),
  }
}

export const calculatePartyServiceConfiguration = (service, input = {}) => {
  if (!isRecord(input)) invalid('Проверьте параметры услуги')
  const { participantTiers = [], addons = [], optionGroups = [] } = service.configuration || {}
  const addonIds = list(input.addonIds, 'Проверьте выбранные дополнения')
  const optionIds = input.optionIds ?? {}
  if (!isRecord(optionIds)) invalid('Проверьте выбранные варианты')

  const parameters = { participants: null, addonIds: [], optionIds: {} }
  const details = []
  let tier
  if (participantTiers.length) {
    const count = integer(input.participants, 1, participantLimit, 'Укажите количество участников целым числом от 1 до 100 000', 'participants')
    tier = participantTiers.find(({ min, max }) => count >= min && (max == null || count <= max))
    if (!tier) invalid('Для такого количества участников нет диапазона', 'participants')
    parameters.participants = count
    details.push(`Участников: ${count}`)
  } else if (!isBlank(input.participants)) {
    invalid('У услуги нет настройки количества участников', 'participants')
  }

  let total = kopecks(tier?.price ?? service.price ?? 0)
  let durationMinutes = duration(tier?.durationMinutes ?? service.duration ?? 0)
  if (tier) {
    const extra = Math.max(0, parameters.participants - (tier.includedParticipants ?? tier.min - 1))
    total += extra * kopecks(tier.pricePerParticipant ?? 0)
    if (tier.maxPrice != null) total = Math.min(total, kopecks(tier.maxPrice))
  }
  if (!Number.isSafeInteger(total) || total > amountLimitKopecks)
    invalid('Стоимость для этого количества участников слишком велика', 'participants')

  const selectedAddons = new Set(addonIds)
  if (selectedAddons.size !== addonIds.length || addonIds.some((id) => !addons.some((addon) => addon.id === id)))
    invalid('Выберите доступные дополнения услуги', 'addonIds')

  for (const addon of addons) {
    if (!selectedAddons.has(addon.id)) continue
    parameters.addonIds.push(addon.id)
    details.push(addon.title)
    total += kopecks(addon.priceDelta ?? 0, { signed: true })
    durationMinutes += addon.durationDelta ?? 0
  }

  if (Object.keys(optionIds).some((id) => !optionGroups.some((group) => group.id === id)))
    invalid('Выберите вариант из доступных списков услуги', 'optionIds')
  const selectedOptions = []
  for (const group of optionGroups) {
    const selectedId = Object.hasOwn(optionIds, group.id) ? optionIds[group.id] : null
    if (isBlank(selectedId) && !group.required) continue
    const choice = group.options.find(({ id }) => id === selectedId)
    if (!choice) invalid(`Выберите вариант в списке «${group.title}»`, `optionIds.${group.id}`)
    selectedOptions.push([group.id, choice.id])
    details.push(`${group.title}: ${choice.title}`)
    total += kopecks(choice.priceDelta ?? 0, { signed: true })
    durationMinutes += choice.durationDelta ?? 0
  }
  parameters.optionIds = Object.fromEntries(selectedOptions)

  if (total < 0 || total > amountLimitKopecks)
    invalid('Выберите параметры, при которых стоимость услуги составит от 0 до 1 трлн ₽')
  if (durationMinutes < 0 || durationMinutes > durationLimit)
    invalid('Выберите параметры, при которых длительность услуги составит от нуля до семи дней')

  return { parameters, unitPrice: total / 100, durationMinutes, details }
}
