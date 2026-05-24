import getMinutesBetween from './getMinutesBetween'

const getEventDuration = (event) => {
  const start = event?.eventDate
  return getMinutesBetween(start, event?.dateEnd)
}

export default getEventDuration
