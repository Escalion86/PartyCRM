import { defaultPartyInboxSchedule, parsePartyInboxSchedule } from './partyInboxSchedule.js'

const fallbackZone = 'Asia/Krasnoyarsk'

export const normalizePartyInboxTimeZone = (value) => {
  if (typeof value !== 'string' || !value.trim()) return fallbackZone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value
  } catch { return fallbackZone }
}

const zonedParts = (value, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(value).filter((item) => item.type !== 'literal').map((item) => [item.type, Number(item.value)]))

const zonedDateTime = ({ year, month, day, hour, minute = 0 }, zone) => {
  const timeZone = normalizePartyInboxTimeZone(zone)
  let result = new Date(Date.UTC(year, month - 1, day, hour, minute))
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(result, timeZone)
    const wanted = Date.UTC(year, month - 1, day, hour, minute)
    const observed = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    result = new Date(+result + wanted - observed)
  }
  return result
}

export const calculatePartyInboxResponseDueAt = (incomingAt, zone = fallbackZone, scheduleValue) => {
  const receivedAt = new Date(incomingAt)
  if (!Number.isFinite(+receivedAt)) throw new Error('Некорректное время входящего обращения')
  const timeZone = normalizePartyInboxTimeZone(zone)
  const schedule = scheduleValue == null ? defaultPartyInboxSchedule() : parsePartyInboxSchedule(scheduleValue)
  const exceptions = new Map(schedule.exceptions.map((entry) => [entry.date, entry]))
  const local = zonedParts(receivedAt, timeZone)
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  for (let offset = 0; offset < (schedule.exceptions.length + 1) * 7 + 1; offset += 1) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + offset))
    const window = exceptions.get(day.toISOString().slice(0, 10)) || schedule.week[day.getUTCDay()]
    if (window.closed) continue
    const localMinutes = local.hour * 60 + local.minute
    if (offset === 0 && localMinutes >= minutes(window.opens) && localMinutes < minutes(window.closes)) return new Date(+receivedAt + 15 * 60 * 1000)
    if (offset === 0 && localMinutes >= minutes(window.closes)) continue
    const opening = zonedDateTime({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour: Number(window.opens.slice(0, 2)), minute: Number(window.opens.slice(3)) }, timeZone)
    return new Date(+opening + 30 * 60 * 1000)
  }
  throw new Error('В графике не найден ближайший рабочий день')
}

export const isPartyInboxMeaningfulContent = ({ text, attachments, direction, call = false } = {}) => {
  if (!['incoming', 'outgoing'].includes(direction)) return false
  return call || Boolean(String(text || '').trim()) || (Array.isArray(attachments) && attachments.length > 0)
}

export const getPartyInboxSlaView = (state, now = new Date()) => {
  const dueAt = state?.responseDueAt ? new Date(state.responseDueAt) : null
  const open = Boolean(dueAt && Number.isFinite(+dueAt) && !state?.respondedAt)
  return { responseDueAt: open ? dueAt : null, overdue: open && +dueAt < +new Date(now), slaOpen: open }
}
