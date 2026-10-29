import {
  partyTaskLocalToUtc,
  partyTaskZonedParts,
} from '../../../helpers/partyTasks.js'

const validId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))

export const resourceTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('ru', { timeZone: value }).format(0)
    return value || 'Europe/Moscow'
  } catch {
    return 'Europe/Moscow'
  }
}

export const resourceDateKey = (value, timeZone) => {
  const parts = partyTaskZonedParts(value, resourceTimeZone(timeZone))
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export const validResourceDateKey = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return false
  const date = new Date(`${key}T00:00:00Z`)
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === key
}

export const shiftResourceDate = (key, amount) => {
  if (!validResourceDateKey(key)) return ''
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export const resourcePeriod = (dateKey, view, timeZone) => {
  if (!validResourceDateKey(dateKey)) return null
  const zone = resourceTimeZone(timeZone)
  const civilDate = new Date(`${dateKey}T00:00:00Z`)
  const startKey =
    view === 'week'
      ? shiftResourceDate(dateKey, -((civilDate.getUTCDay() + 6) % 7))
      : dateKey
  const count = view === 'week' ? 7 : 1
  const boundary = (key) => {
    const [year, month, day] = key.split('-').map(Number)
    return partyTaskLocalToUtc({ year, month, day }, zone).toISOString()
  }
  const days = Array.from({ length: count }, (_, index) => {
    const key = shiftResourceDate(startKey, index)
    return {
      key,
      start: boundary(key),
      end: boundary(shiftResourceDate(key, 1)),
    }
  })
  return {
    days,
    dateFrom: days[0].start,
    dateTo: days.at(-1).end,
    startKey,
    endKey: days.at(-1).key,
  }
}

export const resourceDateLabel = (value, timeZone, withTime = true) => {
  if (!value || !Number.isFinite(+new Date(value))) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: resourceTimeZone(timeZone),
    day: 'numeric',
    month: 'short',
    ...(withTime
      ? { hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short' }),
  }).format(new Date(value))
}

export const resourceTimeLabel = (value, timeZone) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: resourceTimeZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

// The endpoint supplies authorized identifiers. Build a local link instead of
// following arbitrary href fields from fixtures, imported data or older APIs.
export const resourceItemHref = (item, companyId, company = false) => {
  if (!validId(companyId)) return ''
  const query = new URLSearchParams({ companyId })
  if (item.kind === 'ticket_session' && validId(item.sessionId)) {
    query.set('sessionId', item.sessionId)
    return `/${company ? 'company' : 'performer'}/ticketing?${query}`
  }
  if (validId(item.orderId)) {
    query.set('orderId', item.orderId)
    return `/${company ? 'company' : 'performer'}/work?${query}`
  }
  return ''
}

export const resourcePreferenceKey = (companyId, preferenceId) =>
  `partycrm.resources.v1:${String(companyId)}:${String(preferenceId)}`

export const normalizeResourcePreference = (input, types = []) => ({
  type: types.some((type) => type.id === input?.type)
    ? input.type
    : types[0]?.id || '',
  view: input?.view === 'week' ? 'week' : 'day',
  presentation: input?.presentation === 'agenda' ? 'agenda' : 'timeline',
})

// Overlap lanes only arrange visible bars; they never infer a conflict or
// capacity shortage. Those facts come from the canonical availability rules.
export const layoutResourceItems = (items, dateFrom, dateTo) => {
  const from = +new Date(dateFrom),
    to = +new Date(dateTo)
  const intervals = items
    .map((item) => ({
      ...item,
      from: +new Date(item.occupiedFrom || item.start),
      until: +new Date(item.occupiedUntil || item.end),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.from) &&
        Number.isFinite(item.until) &&
        item.until > item.from &&
        item.from < to &&
        item.until > from
    )
    .sort(
      (a, b) =>
        a.from - b.from ||
        a.until - b.until ||
        String(a.id).localeCompare(String(b.id))
    )
  const laneEnds = []
  for (const item of intervals) {
    let lane = laneEnds.findIndex((end) => end <= item.from)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = item.until
    item.lane = lane
    item.left = ((Math.max(from, item.from) - from) / (to - from)) * 100
    item.width =
      ((Math.min(to, item.until) - Math.max(from, item.from)) / (to - from)) *
      100
    const visibleFrom = Math.max(from, item.from),
      visibleUntil = Math.min(to, item.until)
    const bodyFrom = Math.max(
        visibleFrom,
        Math.min(visibleUntil, +new Date(item.start))
      ),
      bodyUntil = Math.max(
        bodyFrom,
        Math.min(visibleUntil, +new Date(item.end))
      )
    item.bodyLeft =
      ((bodyFrom - visibleFrom) / (visibleUntil - visibleFrom)) * 100
    item.bodyWidth =
      ((bodyUntil - bodyFrom) / (visibleUntil - visibleFrom)) * 100
  }
  return { intervals, laneCount: Math.max(1, laneEnds.length) }
}
