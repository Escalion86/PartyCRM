const fallbackZone = 'Asia/Krasnoyarsk'

export const normalizePartyInboxTimeZone = (value) => {
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

const schedule = ({ year, month, day }) => {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6 ? { opens: 10, closes: 19 } : { opens: 9, closes: 20 }
}

export const calculatePartyInboxResponseDueAt = (incomingAt, zone = fallbackZone) => {
  const receivedAt = new Date(incomingAt)
  if (!Number.isFinite(+receivedAt)) throw new Error('Некорректное время входящего обращения')
  const timeZone = normalizePartyInboxTimeZone(zone)
  const local = zonedParts(receivedAt, timeZone)
  const today = schedule(local)
  const localMinutes = local.hour * 60 + local.minute
  if (localMinutes >= today.opens * 60 && localMinutes < today.closes * 60) return new Date(+receivedAt + 15 * 60 * 1000)
  let openingDate = { year: local.year, month: local.month, day: local.day }
  if (localMinutes >= today.closes * 60) {
    const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1))
    openingDate = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
  }
  const opening = zonedDateTime({ ...openingDate, hour: schedule(openingDate).opens }, timeZone)
  return new Date(+opening + 30 * 60 * 1000)
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
