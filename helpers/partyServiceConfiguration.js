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

const list = (value, message, limit = listLimit) => {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > limit) invalid(message)
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

export const normalizePartyServiceOptions = (value) => {
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

const normalizeLegacyConfiguration = (value) => {
  if (value == null) return null
  if (!isRecord(value)) invalid('Проверьте настройки услуги')
  const participantTiers = list(value.participantTiers, 'Допустимо до 50 диапазонов участников')
    .map(normalizeParticipantTier)
    .sort((left, right) => left.min - right.min)
  participantTiers.forEach((tier, index) => {
    if (index && (participantTiers[index - 1].max ?? participantLimit) >= tier.min)
      invalid('Диапазоны участников не должны пересекаться')
  })

  const addons = normalizePartyServiceOptions(value.addons)
  const groupIds = new Set()
  const optionGroups = list(value.optionGroups, 'Допустимо до 50 списков выбора').map((group) => {
    const fields = normalizeNamedEntry(group, groupIds)
    const options = normalizePartyServiceOptions(group.options)
    if (!options.length) invalid(`Добавьте варианты в список «${fields.title}»`)
    return { ...fields, required: group.required === true, options }
  })

  return participantTiers.length || addons.length || optionGroups.length
    ? { participantTiers, addons, optionGroups }
    : null
}

const redactLegacyConfigurationPrices = (configuration) => {
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

const calculateLegacyConfiguration = (service, input = {}) => {
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

const fieldTypes = ['number', 'ranges', 'select', 'checkboxes']
const rangeModes = ['base', 'adjustment']
const fieldLimit = 60
const unitsScale = 100
const moneyScale = BigInt(unitsScale)

const numericUnits = (value, { title, allowDecimal }, minimum = 0, maximum = participantLimit, key) => {
  const number = decimal(value)
  const scale = allowDecimal ? unitsScale : 1
  const scaled = Math.round(number * scale)
  if (!Number.isSafeInteger(scaled) || Math.abs(number * scale - scaled) > 1e-7)
    invalid(allowDecimal ? `Укажите число с точностью до двух знаков в поле «${title}»` : `Укажите целое число в поле «${title}»`, key)
  if (number < minimum || number > maximum)
    invalid(`Укажите значение от ${minimum} до ${maximum} в поле «${title}»`, key)
  return scaled / scale || 0
}

const normalizeRange = (value, field, signed) => {
  if (!isRecord(value)) invalid(`Проверьте диапазоны поля «${field.title}»`)
  const min = numericUnits(value.min, field)
  return {
    min,
    max: optional(value.max, (max) => numericUnits(max, field, min)),
    price: optional(value.price, (amount) => price(amount, signed)),
    durationMinutes: optional(value.durationMinutes, (minutes) => duration(minutes, signed)),
    includedUnits: optional(value.includedUnits, (included) => numericUnits(included, field)),
    pricePerUnit: optional(value.pricePerUnit, (rate) => price(rate, signed), 0),
    maxPrice: optional(value.maxPrice, price),
  }
}

export const normalizePartyServiceRanges = (value, field) => {
  const tiers = list(value, 'Допустимо до 50 диапазонов в одном параметре')
    .map((tier) => normalizeRange(tier, field, field.mode !== 'base'))
    .sort((left, right) => left.min - right.min)
  if (!tiers.length) invalid(`Добавьте диапазон в поле «${field.title}»`)
  if (tiers.some((tier, i) => i && (tiers[i - 1].max ?? participantLimit) >= tier.min))
    invalid(`Диапазоны поля «${field.title}» не должны пересекаться`)
  return tiers
}

const normalizeField = (value, ids) => {
  const named = normalizeNamedEntry(value, ids)
  const { type } = value
  if (!fieldTypes.includes(type)) invalid(`Выберите тип параметра «${named.title}»`)
  const field = { ...named, type, required: value.required === true }
  if (type === 'select' || type === 'checkboxes') {
    const options = normalizePartyServiceOptions(value.options)
    if (!options.length) invalid(`Добавьте варианты в поле «${field.title}»`)
    return { ...field, options }
  }

  const unit = typeof value.unit === 'string' ? value.unit.trim() : ''
  if (!unit || unit.length > 80) invalid(`Укажите единицу измерения до 80 символов в поле «${field.title}»`)
  Object.assign(field, { unit, allowDecimal: value.allowDecimal === true })
  if (type === 'number') {
    const min = optional(value.min, (minimum) => numericUnits(minimum, field))
    const max = optional(value.max, (maximum) => numericUnits(maximum, field, min ?? 0))
    return {
      ...field,
      min,
      max,
      pricePerUnit: optional(value.pricePerUnit, (amount) => price(amount, true), 0),
      durationPerUnit: optional(value.durationPerUnit, (minutes) => duration(minutes, true), 0),
    }
  }

  const mode = value.mode ?? 'adjustment'
  if (!rangeModes.includes(mode)) invalid(`Выберите правило расчёта в поле «${field.title}»`)
  return { ...field, mode, tiers: normalizePartyServiceRanges(value.tiers, { ...field, mode }) }
}

const isFieldConfiguration = (configuration) => isRecord(configuration) && Object.hasOwn(configuration, 'fields')

export const normalizePartyServiceConfiguration = (value) => {
  if (!isFieldConfiguration(value)) return normalizeLegacyConfiguration(value)
  const ids = new Set()
  const fields = list(value.fields, 'Допустимо до 60 параметров услуги', fieldLimit)
    .map((field) => normalizeField(field, ids))
  if (fields.filter(({ type, mode }) => type === 'ranges' && mode === 'base').length > 1)
    invalid('Только один параметр с диапазонами может задавать базовую цену и длительность')
  return fields.length ? { fields } : null
}

export const editablePartyServiceConfiguration = (configuration) => {
  if (isFieldConfiguration(configuration)) return configuration
  const { participantTiers = [], addons = [], optionGroups = [] } = configuration || {}
  const ids = new Set(optionGroups.map(({ id }) => id))
  const uniqueId = (base) => {
    let id = base
    for (let suffix = 2; ids.has(id); suffix++) id = `${base}-${suffix}`
    ids.add(id)
    return id
  }
  const fields = []
  if (participantTiers.length) fields.push({
    id: uniqueId('legacy-participants'), title: 'Количество участников', unit: 'чел.',
    type: 'ranges', required: true, allowDecimal: false, mode: 'base',
    tiers: participantTiers.map(({ includedParticipants, pricePerParticipant, ...tier }) =>
      ({ ...tier, includedUnits: includedParticipants, pricePerUnit: pricePerParticipant })
    ),
  })
  if (addons.length) fields.push({ id: uniqueId('legacy-addons'), title: 'Дополнения', type: 'checkboxes', required: false, options: addons })
  fields.push(...optionGroups.map((group) => ({ ...group, type: 'select' })))
  return { fields }
}

export const redactPartyServiceConfigurationPrices = (configuration) => {
  if (!isFieldConfiguration(configuration)) return redactLegacyConfigurationPrices(configuration)
  const fields = configuration.fields.map(({ id, title, type, required, unit, allowDecimal, min, max, durationPerUnit, mode, tiers, options }) => {
    const shared = { id, title, type, required }
    if (type === 'number') return { ...shared, unit, allowDecimal, min, max, durationPerUnit }
    if (type === 'ranges') return {
      ...shared, unit, allowDecimal, mode,
      tiers: tiers.map(({ min, max, includedUnits, durationMinutes }) => ({ min, max, includedUnits, durationMinutes })),
    }
    return { ...shared, options: options.map(({ id, title, durationDelta }) => ({ id, title, durationDelta })) }
  })
  return { fields }
}

const amount = (value = 0) => BigInt(kopecks(value, { signed: true })) * moneyScale
const asTicks = (value) => Math.round(value * unitsScale)

const selectionsForField = (field, value, key) => {
  if (field.type === 'select' && !hasValidId(value)) invalid(`Выберите вариант в поле «${field.title}»`, key)
  const ids = new Set(field.type === 'select' ? [value] : list(value, `Выберите варианты в поле «${field.title}»`))
  const choices = field.options.filter(({ id }) => ids.has(id))
  if (ids.size !== choices.length) invalid(`Проверьте выбранные варианты в поле «${field.title}»`, key)
  return choices
}

const calculateFields = (service, input) => {
  if (!isRecord(input) || Object.keys(input).some((key) => key !== 'values') || (input.values != null && !isRecord(input.values)))
    invalid('Проверьте параметры услуги')
  const values = input.values ?? {}
  const { fields } = service.configuration
  if (Object.keys(values).some((id) => !fields.some((field) => field.id === id)))
    invalid('Проверьте значения параметров услуги')

  let basePrice = null
  let baseDuration = null
  let extraPrice = 0n
  let extraDuration = 0
  const captured = []
  const details = []
  for (const field of fields) {
    const { id, title, type } = field
    const key = `values.${id}`
    const value = Object.hasOwn(values, id) ? values[id] : undefined
    if (isBlank(value) || (type === 'checkboxes' && Array.isArray(value) && value.length === 0)) {
      if (field.required) invalid(`Заполните поле «${title}»`, key)
      continue
    }
    if (type === 'select' || type === 'checkboxes') {
      const choices = selectionsForField(field, value, key)
      captured.push([id, type === 'select' ? choices[0].id : choices.map((choice) => choice.id)])
      details.push(`${title}: ${choices.map((choice) => choice.title).join(', ')}`)
      for (const choice of choices) {
        extraPrice += amount(choice.priceDelta)
        extraDuration += asTicks(choice.durationDelta ?? 0)
      }
      continue
    }

    const number = numericUnits(value, field, field.min ?? 0, field.max ?? participantLimit, key)
    const ticks = asTicks(number)
    captured.push([id, number])
    details.push(`${title}: ${number.toLocaleString('ru-RU')} ${field.unit}`)
    if (type === 'number') {
      extraPrice += BigInt(ticks) * BigInt(kopecks(field.pricePerUnit ?? 0, { signed: true }))
      extraDuration += ticks * (field.durationPerUnit ?? 0)
      continue
    }

    const tier = field.tiers.find(({ min, max }) => number >= min && (max == null || number <= max))
    if (!tier) invalid(`Для такого значения в поле «${title}» нет диапазона`, key)
    const replacesBase = field.mode === 'base'
    const included = tier.includedUnits == null
      ? Math.max(0, asTicks(tier.min) - (field.allowDecimal ? 1 : unitsScale))
      : asTicks(tier.includedUnits)
    const chargedTicks = Math.max(0, ticks - included)
    let tierPrice = tier.price == null ? (replacesBase ? amount(service.price ?? 0) : 0n) : amount(tier.price)
    tierPrice += BigInt(chargedTicks) * BigInt(kopecks(tier.pricePerUnit ?? 0, { signed: true }))
    if (tier.maxPrice != null && tierPrice > amount(tier.maxPrice)) tierPrice = amount(tier.maxPrice)
    if (replacesBase) {
      basePrice = tierPrice
      if (tier.durationMinutes != null) baseDuration = asTicks(tier.durationMinutes)
    } else {
      extraPrice += tierPrice
      extraDuration += asTicks(tier.durationMinutes ?? 0)
    }
  }

  const total = (basePrice ?? amount(service.price ?? 0)) + extraPrice
  const minutes = (baseDuration ?? asTicks(duration(service.duration ?? 0))) + extraDuration
  if (total < 0n || total > BigInt(amountLimitKopecks) * moneyScale)
    invalid('Выберите параметры, при которых стоимость услуги составит от 0 до 1 трлн ₽')
  if (minutes < 0 || minutes > asTicks(durationLimit))
    invalid('Выберите параметры, при которых длительность услуги составит от нуля до семи дней')
  return {
    parameters: { values: Object.fromEntries(captured) },
    unitPrice: Number((total + moneyScale / 2n) / moneyScale) / 100,
    durationMinutes: Math.round(minutes / unitsScale),
    details,
  }
}

export const calculatePartyServiceConfiguration = (service, input = {}) =>
  isFieldConfiguration(service.configuration) ? calculateFields(service, input) : calculateLegacyConfiguration(service, input)
