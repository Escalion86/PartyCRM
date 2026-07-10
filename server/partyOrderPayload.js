const parseDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseDurationMinutes = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.floor(number)
}

export const normalizePartyOrderTiming = ({
  eventDate,
  dateEnd,
  durationMinutes,
} = {}) => {
  const start = parseDate(eventDate)
  const explicitEnd = parseDate(dateEnd)
  const explicitDuration = parseDurationMinutes(durationMinutes)

  if (!start) {
    return {
      eventDate: null,
      dateEnd: explicitEnd,
      durationMinutes: explicitDuration ?? 60,
    }
  }

  if (explicitDuration) {
    return {
      eventDate: start,
      dateEnd: new Date(start.getTime() + explicitDuration * 60 * 1000),
      durationMinutes: explicitDuration,
    }
  }

  if (explicitEnd && explicitEnd > start) {
    return {
      eventDate: start,
      dateEnd: explicitEnd,
      durationMinutes: Math.max(
        Math.round((explicitEnd.getTime() - start.getTime()) / 60000),
        1
      ),
    }
  }

  return {
    eventDate: start,
    dateEnd: new Date(start.getTime() + 60 * 60 * 1000),
    durationMinutes: 60,
  }
}

