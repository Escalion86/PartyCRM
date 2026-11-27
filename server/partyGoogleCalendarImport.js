import { createHash } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { partyTaskLocalToUtc } from '../helpers/partyTasks.js'

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 366
const MAX_PREVIEW_EVENTS = 1_000
const MAX_PREVIEW_PAGES = 20
const DEFAULT_TIME_ZONE = 'Europe/Moscow'

export const MAX_PARTY_GOOGLE_IMPORT_EVENTS = 100

export class PartyGoogleCalendarImportError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const invalidRange = () => new PartyGoogleCalendarImportError(
  400, 'party_calendar_invalid_import_range', 'Выберите корректный период до 366 дней'
)

const tooManyEvents = () => new PartyGoogleCalendarImportError(
  422, 'party_calendar_import_range_too_busy', 'За этот период слишком много событий. Выберите более короткий период.'
)

const parseDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? parsePartyIsoDate(value + 'T00:00:00Z')
  : null

const dateParts = (day) => ({
  year: day.getUTCFullYear(),
  month: day.getUTCMonth() + 1,
  day: day.getUTCDate(),
})

const midnightIn = (day, timeZone) => partyTaskLocalToUtc(dateParts(day), timeZone)

export const getPartyGoogleImportTimeZone = (value, fallback = DEFAULT_TIME_ZONE) => {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
    return value
  } catch {
    return fallback
  }
}

export const parsePartyGoogleImportRange = ({ from, to }, timeZone) => {
  const start = parseDay(from)
  const lastDay = parseDay(to)
  if (!start || !lastDay || lastDay < start || lastDay - start >= MAX_RANGE_DAYS * DAY_MS) {
    throw invalidRange()
  }
  const timeMin = midnightIn(start, timeZone).toISOString()
  const timeMax = midnightIn(new Date(+lastDay + DAY_MS), timeZone).toISOString()
  if (timeMin >= timeMax || !parsePartyIsoDate(timeMax)) throw invalidRange()
  return { timeMin, timeMax }
}

const validEventId = (value) => typeof value === 'string' && /^[^\s\u0000-\u001f\u007f]{1,1024}$/.test(value)

export const parsePartyGoogleImportEventIds = (eventIds) => {
  if (!Array.isArray(eventIds) || !eventIds.length ||
      eventIds.length > MAX_PARTY_GOOGLE_IMPORT_EVENTS || !eventIds.every(validEventId)) {
    throw new PartyGoogleCalendarImportError(
      400, 'party_calendar_invalid_import_selection', 'Выберите от 1 до 100 событий для импорта'
    )
  }
  return [...new Set(eventIds)]
}

const readCalendarPages = async ({ client, calendarId, range }) => {
  const events = []
  let pageToken
  let sourceTimeZone
  for (let page = 0; page < MAX_PREVIEW_PAGES; page += 1) {
    const result = await client.listEvents(calendarId, { ...range, pageToken })
    if (Array.isArray(result?.items)) events.push(...result.items)
    if (events.length > MAX_PREVIEW_EVENTS) throw tooManyEvents()
    sourceTimeZone ||= result?.timeZone
    pageToken = result?.nextPageToken || undefined
    if (!pageToken) return { events, sourceTimeZone }
  }
  throw tooManyEvents()
}

const getImportKey = (calendarId, eventId) => createHash('sha256')
  .update(JSON.stringify([calendarId, eventId]))
  .digest('hex')

const cleanText = (value, maxLength) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maxLength).trimEnd()
  : ''

const plainDescription = (value) => {
  if (typeof value !== 'string') return ''
  const plain = sanitizeHtml(value.replace(/<br\s*\/?>|<\/(?:p|div|li)>/gi, '\n'), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
  return cleanText(plain, 2000)
}

const googleEventLink = (value) => {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    const eventKey = url.searchParams.get('eid')
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['calendar.google.com', 'www.google.com', 'google.com'].includes(url.hostname) ||
        !/^\/calendar\/(?:u\/\d+\/)?event$/.test(url.pathname) ||
        !eventKey || !/^[a-z\d+=/_-]{1,500}$/i.test(eventKey)) return ''
    url.search = new URLSearchParams({ eid: eventKey }).toString()
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

const parseTimedEventDate = (value, timeZone) => {
  const dateTime = value?.dateTime
  const absolute = parsePartyIsoDate(dateTime)
  if (absolute || typeof dateTime !== 'string') return absolute
  const local = parsePartyIsoDate(dateTime + 'Z')
  if (!local) return null
  return partyTaskLocalToUtc({
    ...dateParts(local),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  }, getPartyGoogleImportTimeZone(value.timeZone, timeZone))
}

const toCandidate = (event, { calendarId, tenantId, timeZone }) => {
  const allDay = Boolean(event.start?.date || event.end?.date)
  const startDay = allDay ? parseDay(event.start?.date) : null
  const endDay = allDay ? parseDay(event.end?.date) : null
  const startsAt = allDay ? startDay && midnightIn(startDay, timeZone) : parseTimedEventDate(event.start, timeZone)
  const endsAt = allDay ? endDay && midnightIn(endDay, timeZone) : parseTimedEventDate(event.end, timeZone)
  const privateProperties = event.extendedProperties?.private
  const orderId = privateProperties?.partycrmOrderId
  const linkedOrderId = privateProperties?.partycrmTenantId === String(tenantId) &&
    typeof orderId === 'string' && /^[a-f\d]{24}$/i.test(orderId) ? orderId.toLowerCase() : ''
  const reason = event.eventType && event.eventType !== 'default'
    ? 'unsupported_type'
    : !startsAt || !endsAt || endsAt <= startsAt ? 'invalid_dates' : ''
  return {
    id: event.id,
    key: getImportKey(calendarId, event.id),
    linkedOrderId,
    title: cleanText(event.summary, 180) || 'Событие Google Calendar',
    location: cleanText(event.location, 500),
    startsAt,
    endsAt,
    allDay,
    ...(startDay && { startDay: event.start.date }),
    ...(endDay && { endDay: event.end.date }),
    reason,
    event,
  }
}

const markExistingOrders = async (candidates, { orderModel, tenantId, calendarId }) => {
  if (!candidates.length) return candidates
  const ids = candidates.map((candidate) => candidate.id)
  const orderIds = candidates.flatMap((candidate) => candidate.linkedOrderId ? [candidate.linkedOrderId] : [])
  const orders = await orderModel.find({
    tenantId,
    $or: [
      { googleCalendarImportKey: { $in: candidates.map((candidate) => candidate.key) } },
      ...(orderIds.length ? [{ _id: { $in: orderIds } }] : []),
      {
        googleCalendarCalendarId: { $in: [calendarId, '', null] },
        $or: [
          { googleCalendarEventId: { $in: ids } },
          { 'additionalEvents.googleCalendarEventId': { $in: ids } },
        ],
      },
    ],
  }).select('_id googleCalendarImportKey googleCalendarEventId googleCalendarCalendarId additionalEvents.googleCalendarEventId').lean()
  const linkedOrders = new Set(orders.map((order) => String(order._id)))
  const linkedKeys = new Set(orders.map((order) => order.googleCalendarImportKey).filter(Boolean))
  const linkedEventIds = new Set()
  for (const order of orders) {
    if (!order.googleCalendarCalendarId || order.googleCalendarCalendarId === calendarId) {
      linkedEventIds.add(order.googleCalendarEventId)
      for (const additional of order.additionalEvents || []) {
        linkedEventIds.add(additional.googleCalendarEventId)
      }
    }
  }

  return candidates.map((candidate) => linkedKeys.has(candidate.key) ||
      linkedEventIds.has(candidate.id) || linkedOrders.has(candidate.linkedOrderId)
    ? { ...candidate, reason: 'already_imported' }
    : candidate)
}

export const readPartyGoogleCalendarImport = async ({
  client, calendarId, range, timeZone, tenantId, orderModel, eventIds,
}) => {
  const { events, sourceTimeZone } = await readCalendarPages({ client, calendarId, range })
  await client.flushCredentialsUpdates()
  const eventTimeZone = getPartyGoogleImportTimeZone(sourceTimeZone, timeZone)
  const requestedIds = eventIds && new Set(eventIds)
  const candidates = new Map()
  for (const event of events) {
    if (!validEventId(event?.id) || event.status === 'cancelled' ||
        (requestedIds && !requestedIds.has(event.id)) || candidates.has(event.id)) continue
    candidates.set(event.id, toCandidate(event, { calendarId, tenantId, timeZone: eventTimeZone }))
  }
  return markExistingOrders([...candidates.values()], { orderModel, tenantId, calendarId })
}

export const serializePartyGoogleCalendarImportCandidate = (candidate) => {
  const { id, title, location, startsAt, endsAt, allDay, startDay, endDay, reason } = candidate
  return {
    id, title, location, allDay, startDay, endDay,
    startsAt: startsAt?.toISOString() || null,
    endsAt: endsAt?.toISOString() || null,
    eligible: !reason,
    alreadyImported: reason === 'already_imported',
    ...(reason && { reason }),
  }
}

export const createPartyGoogleCalendarImportOrders = async ({
  orderModel, tenantId, calendarId, eventIds, workflowStageId, candidates, now = new Date(),
}) => {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  if (candidates.some((candidate) => !candidate.reason)) await orderModel.init()

  const items = []
  for (const id of eventIds) {
    const candidate = byId.get(id)
    if (!candidate || candidate.reason) {
      items.push({ id, status: 'skipped', reason: candidate?.reason || 'unavailable' })
      continue
    }
    const { event, key, startsAt, endsAt, title, location } = candidate
    const filter = { tenantId, googleCalendarImportKey: key }
    const payload = {
      ...filter,
      title,
      status: 'draft',
      workflowStageId,
      eventDate: startsAt,
      dateEnd: endsAt,
      durationMinutes: Math.ceil((endsAt - startsAt) / 60_000),
      ...(location && { placeType: 'client_address', customAddress: location }),
      adminComment: plainDescription(event.description),
      googleCalendarEventId: id,
      googleCalendarCalendarId: calendarId,
      googleCalendarEventUrl: googleEventLink(event.htmlLink),
      calendarImportedAt: now,
      calendarImportChecked: false,
      googleCalendarSyncDisabled: true,
      createdAt: now,
      updatedAt: now,
    }
    try {
      const result = await orderModel.updateOne(filter, { $setOnInsert: payload }, {
        upsert: true, runValidators: true, timestamps: false,
      })
      if (result.upsertedCount === 1) items.push({ id, status: 'imported' })
      else items.push({ id, status: 'skipped', reason: 'already_imported' })
    } catch (error) {
      const duplicate = error?.code === 11000 && error.keyPattern?.googleCalendarImportKey
      items.push({ id, status: 'skipped', reason: duplicate ? 'already_imported' : 'save_failed' })
    }
  }

  const imported = items.filter((item) => item.status === 'imported').length
  return { imported, skipped: items.length - imported, items }
}
