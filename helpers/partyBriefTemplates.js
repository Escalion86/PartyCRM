export const PARTY_BRIEF_FIELD_TYPES = Object.freeze({
  text: 'Короткий текст',
  textarea: 'Развёрнутый ответ',
  number: 'Число',
  select: 'Выбор варианта',
  checkbox: 'Да / нет',
  date: 'Дата',
})
export const PARTY_LEGACY_BRIEF_FIELDS = Object.freeze(
  [
    ['occasion', 'Повод', 'text'],
    ['celebrantName', 'Имя именинника', 'text'],
    ['celebrantAge', 'Возраст именинника', 'number'],
    ['guestCount', 'Количество гостей', 'number'],
    ['guestAgeRange', 'Возраст гостей', 'text'],
    ['interests', 'Интересы', 'textarea'],
    ['previousPrograms', 'Предыдущие программы', 'textarea'],
    ['characters', 'Герои', 'textarea'],
    ['costumeOptions', 'Варианты костюмов', 'textarea'],
    ['eventFormat', 'Формат праздника', 'textarea'],
    ['venueConditions', 'Условия площадки', 'textarea'],
    ['cakeAndGifts', 'Торт и подарки', 'textarea'],
    ['wishes', 'Пожелания', 'textarea'],
    ['restrictions', 'Ограничения', 'textarea'],
  ].map(([legacyKey, label, type]) => ({
    id: `legacy_${legacyKey}`,
    legacyKey,
    label,
    type,
    options: [],
    required: true,
  }))
)

const defaultKeys = new Set([
  'occasion',
  'celebrantName',
  'celebrantAge',
  'guestCount',
  'wishes',
  'restrictions',
])
export const getPartyDefaultBriefTemplate = () => ({
  title: 'Бриф заказа',
  revision: 0,
  fields: PARTY_LEGACY_BRIEF_FIELDS.filter((field) =>
    defaultKeys.has(field.legacyKey)
  ).map((field) => ({ ...field })),
  retiredFields: PARTY_LEGACY_BRIEF_FIELDS.filter(
    (field) => !defaultKeys.has(field.legacyKey)
  ).map((field) => ({ ...field, retiredAtRevision: 0 })),
})

export const hasPartyBriefAnswer = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.some(hasPartyBriefAnswer)
  if (typeof value === 'object') return Object.keys(value).length > 0
  return String(value).trim().length > 0
}

export const getPartyBriefAnswer = (brief, field) =>
  Object.hasOwn(brief?.customAnswers || {}, field.id)
    ? brief.customAnswers[field.id]
    : field.legacyKey
      ? brief?.[field.legacyKey]
      : undefined

const serviceId = (value) => String(value?._id || value || '').toLowerCase()
export const isPartyBriefFieldApplicable = (field, servicesIds = []) => {
  if (!Array.isArray(field.serviceIds) || !field.serviceIds.length) return true
  const selected = new Set(
    (Array.isArray(servicesIds) ? servicesIds : []).map(serviceId)
  )
  return field.serviceIds.some((id) => selected.has(serviceId(id)))
}

export const getPartyApplicableBriefFields = (template, servicesIds) => {
  const fields = template?.fields || []
  if (
    Array.isArray(template?.applicableFieldIds) &&
    (servicesIds === undefined || template.applicabilityFrozen === true)
  ) {
    const applicable = new Set(template.applicableFieldIds)
    return fields.filter((field) => applicable.has(field.id))
  }
  return fields.filter((field) =>
    isPartyBriefFieldApplicable(field, servicesIds)
  )
}

export const getPartyBriefMissingFields = (brief, template, servicesIds) =>
  getPartyApplicableBriefFields(template, servicesIds)
    .filter(
      (field) =>
        field.required !== false &&
        !hasPartyBriefAnswer(getPartyBriefAnswer(brief, field))
    )
    .map(({ id, label }) => ({ id, label }))

export const getPartyArchivedBriefAnswers = (
  brief = {},
  template = getPartyDefaultBriefTemplate()
) => {
  const activeIds = new Set((template.fields || []).map((field) => field.id))
  const activeLegacyKeys = new Set(
    (template.fields || []).map((field) => field.legacyKey).filter(Boolean)
  )
  const retired = new Map(
    (template.retiredFields || []).map((field) => [field.id, field])
  )
  for (const field of PARTY_LEGACY_BRIEF_FIELDS)
    if (
      !activeIds.has(field.id) &&
      !activeLegacyKeys.has(field.legacyKey) &&
      !retired.has(field.id)
    )
      retired.set(field.id, field)
  const result = []
  const included = new Set()
  for (const [fieldId, value] of Object.entries(brief.customAnswers || {})) {
    if (activeIds.has(fieldId) || !hasPartyBriefAnswer(value)) continue
    const field = retired.get(fieldId) || {
      id: fieldId,
      label: fieldId,
      type: 'text',
      options: [],
    }
    result.push({ field, value })
    included.add(fieldId)
  }
  for (const field of retired.values()) {
    if (
      activeIds.has(field.id) ||
      included.has(field.id) ||
      !field.legacyKey ||
      activeLegacyKeys.has(field.legacyKey)
    )
      continue
    const value = getPartyBriefAnswer(brief, field)
    if (hasPartyBriefAnswer(value)) result.push({ field, value })
  }
  const knownLegacyKeys = new Set(
    PARTY_LEGACY_BRIEF_FIELDS.map((field) => field.legacyKey)
  )
  for (const [key, value] of Object.entries(brief)) {
    if (
      knownLegacyKeys.has(key) ||
      ['customAnswers', 'templateSnapshot', 'archivedAnswers'].includes(key) ||
      !hasPartyBriefAnswer(value)
    )
      continue
    result.push({
      field: { id: `unknown_${key}`, label: key, type: 'text', options: [] },
      value,
    })
  }
  for (const answer of brief.archivedAnswers || [])
    if (
      answer?.field &&
      hasPartyBriefAnswer(answer.value) &&
      !included.has(answer.field.id)
    )
      result.push(answer)
  return result
}

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
export const copyPartyBriefValues = (value, depth = 0) => {
  if (depth > 100) throw new Error('Слишком сложная структура ответа брифа')
  if (value === null || ['boolean', 'number'].includes(typeof value))
    return value
  if (typeof value === 'string') return value
  if (Array.isArray(value))
    return value.map((item) => copyPartyBriefValues(item, depth + 1))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !forbiddenKeys.has(key) && !key.startsWith('$'))
        .map(([key, item]) => [key, copyPartyBriefValues(item, depth + 1)])
    )
  return null
}

export const resolvePartyBriefTemplate = (brief, template, orderStatus) => {
  if (orderStatus === 'closed' && brief?.templateSnapshot?.fields)
    return brief.templateSnapshot
  if (orderStatus === 'closed')
    return {
      title: 'Бриф заказа',
      revision: 0,
      fields: PARTY_LEGACY_BRIEF_FIELDS.map((field) => ({ ...field })),
      retiredFields: [],
    }
  return template || getPartyDefaultBriefTemplate()
}
