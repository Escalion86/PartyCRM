export const PARTY_VENUE_MAX_BUFFER_MINUTES = 1440
const DAY_MS = 86400000

export const partyVenueFailure = (
  message,
  status = 400,
  code = 'partycrm_invalid_venue_booking'
) => Object.assign(new Error(message), { status, code })

export const partyVenueId = (value) => {
  if (typeof value !== 'string' && typeof value?.toHexString !== 'function')
    throw partyVenueFailure('Некорректная компания, площадка или запись')
  const id = String(value || '')
  if (!/^[a-f\d]{24}$/i.test(id))
    throw partyVenueFailure('Некорректная компания, площадка или запись')
  return id.toLowerCase()
}

export const normalizePartyVenueSettings = (
  body = {},
  { partial = false } = {}
) => {
  const result = {}
  if (!partial || Object.hasOwn(body, 'usageMode')) {
    const mode = body.usageMode ?? 'exclusive'
    if (!['exclusive', 'shared'].includes(mode))
      throw partyVenueFailure('Выберите режим использования площадки')
    result.usageMode = mode
  }
  for (const key of ['preparationMinutes', 'cleanupMinutes']) {
    if (partial && !Object.hasOwn(body, key)) continue
    const value = body[key] == null || body[key] === '' ? 0 : Number(body[key])
    if (
      (body[key] != null && !['number', 'string'].includes(typeof body[key])) ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > PARTY_VENUE_MAX_BUFFER_MINUTES
    )
      throw partyVenueFailure(
        'Время подготовки и уборки должно быть от 0 до 1440 минут'
      )
    result[key] = value
  }
  return result
}

export const getPartyVenueWindow = (booking, location = {}) => {
  const startValue = booking?.startsAt ?? booking?.eventDate
  const endValue = booking?.endsAt ?? booking?.dateEnd
  if (startValue == null || startValue === '') return null
  const startsAt = new Date(startValue)
  const endsAt = new Date(endValue)
  if (
    endValue == null ||
    endValue === '' ||
    !Number.isFinite(+startsAt) ||
    !Number.isFinite(+endsAt) ||
    +endsAt <= +startsAt
  )
    throw partyVenueFailure('Укажите начало и окончание занятия площадки')
  const settings = normalizePartyVenueSettings(location)
  const occupiedFrom = new Date(+startsAt - settings.preparationMinutes * 60000)
  const occupiedUntil = new Date(+endsAt + settings.cleanupMinutes * 60000)
  if (+occupiedUntil - +occupiedFrom > 370 * DAY_MS)
    throw partyVenueFailure(
      'Период занятия площадки не должен превышать 370 дней'
    )
  return { startsAt, endsAt, occupiedFrom, occupiedUntil }
}

export const getPartyVenueLockDays = ({ occupiedFrom, occupiedUntil }) => {
  const days = []
  const start = Math.floor(+occupiedFrom / DAY_MS)
  // Half-open ranges touching midnight do not occupy the following day.
  const end = Math.floor((+occupiedUntil - 1) / DAY_MS)
  for (let day = start; day <= end; day += 1)
    days.push(new Date(day * DAY_MS).toISOString().slice(0, 10))
  return days
}

export const partyVenueWindowsOverlap = (first, second) =>
  +new Date(first.occupiedFrom) < +new Date(second.occupiedUntil) &&
  +new Date(first.occupiedUntil) > +new Date(second.occupiedFrom)

export const getPartyVenuePeakCapacity = (candidate, bookings) => {
  const changes = []
  for (const booking of [candidate, ...bookings]) {
    const from = Math.max(
      +new Date(candidate.occupiedFrom),
      +new Date(booking.occupiedFrom)
    )
    const until = Math.min(
      +new Date(candidate.occupiedUntil),
      +new Date(booking.occupiedUntil)
    )
    if (from < until) {
      changes.push([from, Number(booking.capacity) || 0])
      changes.push([until, -(Number(booking.capacity) || 0)])
    }
  }
  // Departures first: adjacent sessions do not consume capacity twice.
  changes.sort((first, second) => first[0] - second[0] || first[1] - second[1])
  let capacity = 0
  let peak = 0
  for (const [, change] of changes) {
    capacity += change
    peak = Math.max(peak, capacity)
  }
  return peak
}

export const assertPartyVenueConfiguration = ({
  entries,
  location,
  shareOrders = () => false,
}) => {
  const events = []
  const limit = Number(location.capacity) > 0 ? Number(location.capacity) : null
  for (const entry of entries) {
    if (
      entry.sourceType === 'ticket_session' &&
      (!Number.isSafeInteger(entry.capacity) ||
        entry.capacity < 1 ||
        (limit && entry.capacity > limit))
    )
      throw partyVenueFailure(
        'Настройки площадки не соответствуют вместимости существующих сеансов',
        409,
        'partycrm_venue_configuration_conflict'
      )
    events.push({ time: +entry.occupiedFrom, start: true, entry })
    events.push({ time: +entry.occupiedUntil, start: false, entry })
  }
  events.sort((a, b) => a.time - b.time || Number(a.start) - Number(b.start))
  const active = new Set()
  for (const event of events) {
    if (!event.start) {
      active.delete(event.entry)
      continue
    }
    const entry = event.entry
    for (const other of active) {
      if (
        entry.sourceType === 'order' &&
        other.sourceType === 'order' &&
        shareOrders(entry, other)
      )
        continue
      if (
        entry.sourceType === 'order' ||
        other.sourceType === 'order' ||
        location.usageMode !== 'shared'
      )
        throw partyVenueFailure(
          'Новые настройки создают пересечение уже запланированных занятий площадки',
          409,
          'partycrm_venue_configuration_conflict'
        )
    }
    const tickets = [...active, entry].filter(
      (row) => row.sourceType === 'ticket_session'
    )
    if (tickets.length > 1 && !limit)
      throw partyVenueFailure(
        'Укажите вместимость площадки для совместного режима',
        409,
        'partycrm_venue_configuration_conflict'
      )
    if (limit && tickets.reduce((sum, row) => sum + row.capacity, 0) > limit)
      throw partyVenueFailure(
        'Новая вместимость меньше вместимости одновременных сеансов',
        409,
        'partycrm_venue_configuration_conflict'
      )
    active.add(entry)
  }
}
