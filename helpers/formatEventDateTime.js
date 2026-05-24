import { DAYS_OF_WEEK, MONTHS, MONTHS_FULL } from './constants'
import dateToDateTimeStr from './dateToDateTimeStr'

function formatEventDateTime(event, props = {}) {
  if (!event) return undefined

  const { dontShowDayOfWeek, fullWeek, showYear, fullMonth, weekInBrackets } =
    props

  const eventDate = dateToDateTimeStr(
    event.eventDate,
    !dontShowDayOfWeek,
    fullMonth,
    showYear,
    true,
    fullWeek
  )
  const dateEnd = dateToDateTimeStr(
    event.dateEnd,
    !dontShowDayOfWeek,
    fullMonth,
    showYear,
    true,
    fullWeek
  )
  var date = ''
  if (
    eventDate[0] === dateEnd[0] &&
    eventDate[1] === dateEnd[1] &&
    eventDate[3] === dateEnd[3]
  ) {
    date = `${eventDate[0]} ${eventDate[1]} ${
      weekInBrackets ? `(${eventDate[2]})` : eventDate[2]
    } ${eventDate[4]}:${eventDate[5]} - ${dateEnd[4]}:${dateEnd[5]}`
  } else {
    date = `${eventDate[0]} ${eventDate[1]} ${
      weekInBrackets ? `(${eventDate[2]})` : eventDate[2]
    } ${eventDate[4]}:${eventDate[5]} - ${dateEnd[0]} ${dateEnd[1]} ${
      weekInBrackets ? `(${dateEnd[2]})` : dateEnd[2]
    } ${dateEnd[4]}:${dateEnd[5]}`
  }
  return date
}

export default formatEventDateTime
