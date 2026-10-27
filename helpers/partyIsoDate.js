// Financial facts and optimistic revision checks require an unambiguous instant.
// Date.parse alone accepts impossible dates (for example 30 February).
export const parsePartyIsoDate = (value) => {
  if (typeof value !== 'string') return null
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value
    )
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0', , offset] = match
  const calendar = new Date(Date.UTC(+year, +month - 1, +day))
  if (
    +year < 1000 ||
    calendar.getUTCFullYear() !== +year ||
    calendar.getUTCMonth() !== +month - 1 ||
    calendar.getUTCDate() !== +day ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    return null
  if (
    offset !== 'Z' &&
    (+offset.slice(1, 3) > 14 ||
      +offset.slice(4) > 59 ||
      (+offset.slice(1, 3) === 14 && +offset.slice(4) !== 0))
  )
    return null
  const date = new Date(value)
  return Number.isFinite(+date) ? date : null
}
