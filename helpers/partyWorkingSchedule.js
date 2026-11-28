import { parsePartyInboxSchedule } from './partyInboxSchedule.js'
import { partyBookingFailure, partyMoneyKopecks } from './partyOrderBooking.js'

export const parsePartyWorkingSchedule = (value) => {
  if (value == null) return null
  try {
    return parsePartyInboxSchedule(value)
  } catch (cause) {
    partyBookingFailure(cause.message)
  }
}
export const normalizePartyRentalSettings = (body) => ({
  ...(Object.hasOwn(body, 'hourlyRentalRate')
    ? { hourlyRentalRate: partyMoneyKopecks(body.hourlyRentalRate) / 100 }
    : {}),
  ...(Object.hasOwn(body, 'workingSchedule')
    ? { workingSchedule: parsePartyWorkingSchedule(body.workingSchedule) }
    : {}),
})

const formatter = (timeZone) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
export const partyZonedParts = (value, timeZone) =>
  Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(value))
      .filter((entry) => entry.type !== 'literal')
      .map((entry) => [entry.type, entry.value])
  )
export const partyDateInZone = (value, timeZone) => {
  const parts = partyZonedParts(value, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}
export const partyDateAtTime = (date, time, timeZone) => {
  const target = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(target))
    partyBookingFailure('Укажите существующую дату и время')
  let result = target
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = partyZonedParts(result, timeZone)
    const actual = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`
    )
    const difference = target - actual
    if (!difference) return new Date(result)
    result += difference
  }
  partyBookingFailure(
    'Это местное время не существует в часовом поясе компании'
  )
}
export const partyWorkingWindow = (date, schedule, timeZone) => {
  if (!schedule) return null
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const day =
    schedule.exceptions?.find((entry) => entry.date === date) ||
    schedule.week?.[weekday]
  if (!day || day.closed) return null
  return {
    startsAt: partyDateAtTime(date, day.opens, timeZone),
    endsAt: partyDateAtTime(date, day.closes, timeZone),
  }
}
export const isPartyWithinWorkingSchedule = ({
  startsAt,
  endsAt,
  schedule,
  timeZone,
}) => {
  const start = +new Date(startsAt)
  const end = +new Date(endsAt)
  if (
    !startsAt ||
    !endsAt ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  )
    return false
  if (schedule == null) return true
  const window = partyWorkingWindow(
    partyDateInZone(start, timeZone),
    schedule,
    timeZone
  )
  return Boolean(
    window &&
    start >= +window.startsAt &&
    end <= +window.endsAt
  )
}
