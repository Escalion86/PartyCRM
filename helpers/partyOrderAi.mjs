export const PARTY_AI_FIELDS = {
  title: 'Тип заказа',
  eventDate: 'Дата и время',
  durationMinutes: 'Длительность, мин',
  clientId: 'Клиент',
  locationId: 'Площадка',
  servicesIds: 'Услуги',
  adminComment: 'Комментарий администратора',
  performerComment: 'Комментарий исполнителя',
  contractAmount: 'Сумма клиента',
}

export function normalizePartyAiPatch(raw, catalogs = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('INVALID_AI_RESPONSE')
  const patch = {}
  for (const key of ['title', 'adminComment', 'performerComment']) {
    if (typeof raw[key] === 'string' && raw[key].trim())
      patch[key] = raw[key].trim().slice(0, key === 'title' ? 180 : 2000)
  }
  if (
    typeof raw.eventDate === 'string' &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw.eventDate) &&
    Number.isFinite(Date.parse(raw.eventDate))
  )
    patch.eventDate = new Date(raw.eventDate).toISOString()
  if (
    typeof raw.durationMinutes === 'number' &&
    Number.isInteger(raw.durationMinutes) &&
    raw.durationMinutes > 0 &&
    raw.durationMinutes <= 10080
  )
    patch.durationMinutes = raw.durationMinutes
  if (
    typeof raw.contractAmount === 'number' &&
    Number.isFinite(raw.contractAmount) &&
    raw.contractAmount >= 0 &&
    raw.contractAmount <= 1e9
  )
    patch.contractAmount = raw.contractAmount
  for (const [key, collection] of [
    ['clientId', 'clients'],
    ['locationId', 'locations'],
  ]) {
    if (
      typeof raw[key] === 'string' &&
      catalogs[collection]?.some((item) => String(item._id) === raw[key])
    )
      patch[key] = raw[key]
  }
  if (
    Array.isArray(raw.servicesIds) &&
    raw.servicesIds.length &&
    raw.servicesIds.every(
      (id) =>
        typeof id === 'string' &&
        catalogs.services?.some((item) => String(item._id) === id)
    )
  )
    patch.servicesIds = [...new Set(raw.servicesIds)].slice(0, 50)
  return patch
}

export function applyPartyAiPatch(draft, patch) {
  const next = { ...draft }
  for (const key of Object.keys(PARTY_AI_FIELDS))
    if (Object.hasOwn(patch, key)) next[key] = patch[key]
  if (Object.hasOwn(patch, 'contractAmount'))
    next.clientPayment = {
      ...draft.clientPayment,
      totalAmount: patch.contractAmount,
    }
  if (patch.locationId) next.placeType = 'company_location'
  if (patch.eventDate || patch.durationMinutes) {
    const start = Date.parse(next.eventDate)
    if (Number.isFinite(start))
      next.dateEnd = new Date(
        start + (Number(next.durationMinutes) || 60) * 60000
      ).toISOString()
  }
  return next
}
