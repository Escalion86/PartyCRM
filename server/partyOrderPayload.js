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

const defaultIsValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))

const parseOptionalDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const normalizePartyOrderResponsibleStaffId = (
  value,
  { fallbackStaffId = null, isValidObjectId = defaultIsValidObjectId } = {}
) => {
  const id = String(value || '').trim()
  if (id && isValidObjectId(id)) return id
  const fallback = String(fallbackStaffId || '').trim()
  return fallback && isValidObjectId(fallback) ? fallback : null
}

export const normalizePartyAdditionalEvents = (
  items,
  { isValidObjectId = defaultIsValidObjectId } = {}
) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      const done = Boolean(item?.done)
      const responsibleStaffId = String(item?.responsibleStaffId || '').trim()
      return {
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        description:
          typeof item?.description === 'string'
            ? item.description.trim().slice(0, 1000)
            : '',
        date: parseOptionalDate(item?.date),
        done,
        doneAt: done ? parseOptionalDate(item?.doneAt) || new Date() : null,
        responsibleStaffId:
          responsibleStaffId && isValidObjectId(responsibleStaffId)
            ? responsibleStaffId
            : null,
        googleCalendarEventId:
          typeof item?.googleCalendarEventId === 'string'
            ? item.googleCalendarEventId
            : '',
      }
    })
    .filter((item) => item.title || item.description || item.date)
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
