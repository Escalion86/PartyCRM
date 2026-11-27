import { calculatePartyPlaceBooking } from './partyMultiPlaceBooking.js'
import { isPartyServiceAvailable } from './partyOrderBooking.js'
import { previewPartyOrderService } from './partyOrderServicePreview.js'

const minutesBetween = (start, end) => (+new Date(end) - +new Date(start)) / 60000
const date = (value) => value ? +new Date(value) : NaN
const text = (value) => value == null ? '' : String(value)

const selectionFromItem = (item) => ({
  lineId: item.lineId,
  serviceId: text(item.serviceId),
  quantity: item.quantity,
  ...(item.serviceConfiguration?.parameters ? { parameters: item.serviceConfiguration.parameters } : {}),
})

export const createPartyOrderPlaceDraft = ({
  id, locationId = '', eventDate = '', rental = null, guestCount, parameters, serviceSelections = [],
} = {}) => ({
  id,
  locationId: text(locationId),
  eventDate: text(eventDate),
  rental,
  rentalMinutes: rental ? minutesBetween(rental.startsAt, rental.endsAt) : null,
  guestCount: guestCount ?? '',
  parameters: parameters || {},
  serviceSelections,
})

export const storedPartyOrderPlaceDrafts = (order) => {
  if (order.bookingVersion !== 2) return null
  const itemsByPlace = new Map()
  for (const item of order.orderItems || order.serviceSelections || []) {
    if (!item.placeId || !item.serviceId) continue
    const items = itemsByPlace.get(item.placeId) || []
    items.push(selectionFromItem(item))
    itemsByPlace.set(item.placeId, items)
  }
  return (order.places || []).map((place) => createPartyOrderPlaceDraft({
    ...place,
    parameters: place.locationConfiguration?.parameters,
    serviceSelections: itemsByPlace.get(place.id) || [],
  }))
}

export const partyOrderPlaceAt = (startsAt, durationMinutes) => {
  const start = date(startsAt)
  if (!Number.isFinite(start) || !Number.isSafeInteger(Number(durationMinutes)) || durationMinutes < 1 || durationMinutes > 10080)
    return null
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(start + Number(durationMinutes) * 60000).toISOString() }
}

export const previewPartyOrderPlaceDraft = ({ place, location, servicesById, savedItems, savedPlace, previousLocationId, previousPricingSnapshot, previousTypeId, orderTypeId }) => {
  const locationContext = { orderTypeId, placeType: 'company_location', locationId: place.locationId }
  const unchangedContext = text(previousTypeId) === orderTypeId && text(savedPlace?.locationId ?? previousLocationId) === place.locationId
  const lines = place.serviceSelections.map((selection) => {
    const service = servicesById.get(selection.serviceId)
    const prior = savedItems.find((item) => text(item.serviceId) === selection.serviceId &&
      (item.lineId === selection.lineId || (!item.lineId && text(previousLocationId) === place.locationId)))
    const preview = previewPartyOrderService(service, prior, selection)
    const unchanged = prior && unchangedContext && Number(prior.quantity) === Number(selection.quantity) &&
      JSON.stringify(prior.serviceConfiguration?.parameters) === JSON.stringify(preview.normalizedParameters ?? selection.parameters)
    const quantity = Number(selection.quantity)
    const maxQuantity = service?.repeatable ? Number(service.maxQuantity || 100000) : 1
    const unavailable = !unchanged && !isPartyServiceAvailable(service, locationContext)
    const quantityInvalid = !unchanged && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxQuantity)
    return { ...preview, selection, service, unavailable, quantityInvalid }
  })
  const title = location?.title || savedPlace?.locationTitle || 'Место'
  const invalidLine = lines.find(({ error, unavailable, quantityInvalid }) => error || unavailable || quantityInvalid)
  const serviceError = invalidLine && (invalidLine.unavailable
    ? `Услуга «${invalidLine.item.title}» недоступна для места «${title}».`
    : invalidLine.quantityInvalid
      ? `Проверьте количество услуги «${invalidLine.item.title}» в месте «${title}».`
      : `Заполните параметры услуги «${invalidLine.item.title}» в месте «${title}».`)
  const programMinutes = lines.reduce((total, { item }) => total + (Number(item.durationMinutes) || 0) * (Number(item.quantity) || 0), 0)
  const duration = Math.ceil(programMinutes)
  const rentalMinutes = Number(place.rentalMinutes ?? (place.rental ? minutesBetween(place.rental.startsAt, place.rental.endsAt) : duration || 60))
  const eventDate = duration > 0 ? place.eventDate || place.rental?.startsAt || '' : place.rental?.startsAt || ''
  const dateEnd = Number.isFinite(date(eventDate)) && duration > 0 && duration <= 10080
    ? new Date(date(eventDate) + programMinutes * 60000).toISOString() : place.rental?.endsAt
  const timed = Boolean(place.eventDate || place.rental)
  const timeError = duration > 10080 || !Number.isSafeInteger(rentalMinutes) || rentalMinutes < 1 || rentalMinutes > 10080
    ? `Проверьте длительность в месте «${title}». Допустимо от 1 минуты до 7 дней.`
    : timed && (!place.rental || !eventDate || !dateEnd || date(eventDate) < date(place.rental.startsAt) || date(dateEnd) > date(place.rental.endsAt))
      ? `Аренда места «${title}» должна вмещать всю программу.`
      : ''
  const locationConfiguration = savedPlace && text(savedPlace.locationId) === place.locationId
    ? savedPlace.locationConfiguration
    : previousPricingSnapshot && text(previousLocationId) === place.locationId && !location?.rentalConfiguration
      ? { definition: null, baseHourlyRate: Number(previousPricingSnapshot.hourlyRateKopecks || 0) / 100 }
      : undefined
  const definition = locationConfiguration ? locationConfiguration.definition : location?.rentalConfiguration
  let pricingSnapshot
  let placeError
  if (location) {
    try {
      const result = calculatePartyPlaceBooking({ location, rental: place.rental, items: serviceError ? [] : lines.map(({ item }) => item), parameters: place.parameters, locationConfiguration })
      if (!serviceError) pricingSnapshot = result.pricingSnapshot
    } catch (cause) {
      placeError = cause
    }
  }
  const guestCount = place.guestCount === '' ? null : Number(place.guestCount)
  const capacity = Number(location?.capacity || 0)
  const guestError = guestCount != null && (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 100000 || (capacity > 0 && guestCount > capacity))
    ? `Проверьте число гостей в месте «${title}»${capacity > 0 ? `. Вместимость до ${capacity} чел.` : '.'}`
    : ''
  return { place, location, title, lines, duration, rentalMinutes, eventDate, dateEnd, serviceError, timeError, timed, placeError, guestError, definition, pricingSnapshot, locationConfiguration }
}

export const serializePartyOrderPlaceDrafts = (previews) => previews.map(({ place, eventDate, lines }) => ({
  id: place.id,
  locationId: place.locationId,
  guestCount: place.guestCount === '' ? null : Number(place.guestCount),
  eventDate: eventDate || null,
  rental: place.rental,
  parameters: place.parameters,
  serviceSelections: lines.map(({ selection, configuration, normalizedParameters }) => ({
    lineId: selection.lineId,
    serviceId: selection.serviceId,
    quantity: Number(selection.quantity),
    ...(configuration && normalizedParameters ? { parameters: normalizedParameters } : {}),
  })),
}))
