const MAX_RANGE_MS = 93 * 86400000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const invalid = () => {
  throw Object.assign(new Error('Укажите корректный диапазон календаря до 93 дней и курсор страницы.'), {
    status: 400,
    code: 'partycrm_invalid_calendar_range',
  })
}
const parseDate = (value) => {
  const match = ISO_DATE.exec(value || '')
  if (!match) invalid()
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const lastDay = new Date(0)
  lastDay.setUTCFullYear(year, month, 0)
  if (month < 1 || month > 12 || day < 1 || day > lastDay.getUTCDate() || hour > 23 || minute > 59 || second > 59) invalid()
  const parsed = new Date(value)
  if (!Number.isFinite(+parsed)) invalid()
  return parsed
}

export const hasPartyOrderCalendarQuery = (params) =>
  ['dateFrom', 'dateTo', 'calendarCursor'].some((key) => params.has(key))

export const parsePartyOrderCalendarQuery = (params) => {
  if (!hasPartyOrderCalendarQuery(params)) return null
  const dateFrom = parseDate(params.get('dateFrom'))
  const dateTo = parseDate(params.get('dateTo'))
  const cursor = params.get('calendarCursor') || ''
  if (+dateTo <= +dateFrom || +dateTo - +dateFrom > MAX_RANGE_MS || cursor && !/^[a-f\d]{24}$/i.test(cursor)) invalid()
  return { dateFrom, dateTo, cursor }
}

export const buildPartyOrderCalendarInterval = ({ dateFrom, dateTo }, canViewEnd) =>
  canViewEnd ? {
    eventDate: { $lt: dateTo },
    $or: [
      { dateEnd: { $gte: dateFrom } },
      { dateEnd: null, eventDate: { $gte: dateFrom } },
    ],
  } : { eventDate: { $gte: dateFrom, $lt: dateTo } }
