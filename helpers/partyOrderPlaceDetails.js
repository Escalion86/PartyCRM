export const formatPartyOrderPlaces = (places = []) => places.map((place) => {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: place.timeZone || 'Asia/Krasnoyarsk',
    dateStyle: 'short', timeStyle: 'short',
  })
  const startsAt = place.rental?.startsAt || place.eventDate
  const endsAt = place.rental?.endsAt || place.dateEnd
  const time = startsAt && endsAt ? formatter.formatRange(new Date(startsAt), new Date(endsAt)) : ''
  return [place.locationTitle, place.locationAddress, time].filter(Boolean).join(', ')
}).filter(Boolean).join('\n')
