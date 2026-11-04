export const PARTY_BOOKING_VERSION = 1

export const partyBookingFailure = (
  message,
  status = 400,
  code = 'partycrm_booking_invalid'
) => {
  throw Object.assign(new Error(message), { status, code })
}
const id = (value) => String(value?._id || value || '')
export const partyMoneyKopecks = (value) => {
  if (
    !['number', 'string'].includes(typeof value) ||
    String(value).trim() === ''
  )
    partyBookingFailure('Укажите сумму с точностью до копеек')
  const amount = Number(String(value).replace(',', '.'))
  const cents = Math.round(amount * 100)
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(cents) ||
    cents > 100000000000000 ||
    Math.abs(amount * 100 - cents) > 1e-6
  )
    partyBookingFailure('Укажите неотрицательную сумму с точностью до копеек')
  return cents
}

export const isPartyServiceAvailable = (
  service,
  { orderTypeId, placeType, locationId } = {}
) => {
  if (!service || service.status === 'archived') return false
  if (service.availabilityConfigured !== true) return true // Existing catalogues retain their availability.
  if (
    !(service.orderTypeIds || []).some((value) => id(value) === id(orderTypeId))
  )
    return false
  return placeType === 'client_address'
    ? service.offsiteAllowed === true
    : Boolean(
        locationId &&
        (service.locationIds || []).some(
          (value) => id(value) === id(locationId)
        )
      )
}

export const validatePartyServiceQuantity = (service, value) => {
  const quantity = Number(value)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000)
    partyBookingFailure(
      'Количество услуги должно быть целым числом от 1 до 100 000'
    )
  if (quantity > 1 && service.repeatable !== true)
    partyBookingFailure(
      `Услугу «${service.title}» можно добавить только один раз`
    )
  if (
    service.repeatable &&
    service.maxQuantity != null &&
    quantity > service.maxQuantity
  )
    partyBookingFailure(
      `Для услуги «${service.title}» доступно не более ${service.maxQuantity}`
    )
  return quantity
}

export const calculatePartyBooking = ({
  items = [],
  rental = null,
  hourlyRate = 0,
  placeType = 'company_location',
  discount = { type: 'amount', value: 0 },
}) => {
  let servicesKopecks = 0,
    durationMinutes = 0,
    includedRentalMinutes = 0
  for (const item of items) {
    const quantity = Number(item.quantity)
    const duration = Number(item.durationMinutes || 0)
    const included = Number(item.includedRentalMinutes || 0)
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      !Number.isFinite(included) ||
      included < 0
    )
      partyBookingFailure('Проверьте количество и длительность услуг')
    const lineKopecks = Math.round(
      partyMoneyKopecks(item.unitPrice ?? 0) * quantity
    )
    const lineDiscount = partyMoneyKopecks(item.discount ?? 0)
    if (lineDiscount > lineKopecks)
      partyBookingFailure('Скидка позиции не может превышать её стоимость')
    servicesKopecks += lineKopecks - lineDiscount
    durationMinutes += duration * quantity
    includedRentalMinutes += included * quantity
  }
  let rentalMinutes = 0
  if (placeType !== 'client_address' && rental?.startsAt && rental?.endsAt) {
    rentalMinutes =
      (+new Date(rental.endsAt) - +new Date(rental.startsAt)) / 60000
    if (
      !Number.isFinite(rentalMinutes) ||
      rentalMinutes < 1 ||
      rentalMinutes > 10080
    )
      partyBookingFailure('Аренда должна длиться от одной минуты до семи дней')
  }
  const payableMinutes = Math.max(0, rentalMinutes - includedRentalMinutes)
  const billedHours = Math.ceil(payableMinutes / 60)
  const rentalKopecks = billedHours * partyMoneyKopecks(hourlyRate)
  const subtotalKopecks = servicesKopecks + rentalKopecks
  if (!['amount', 'percent'].includes(discount?.type))
    partyBookingFailure('Выберите вид скидки')
  const discountValue = Number(discount.value || 0)
  if (
    !Number.isFinite(discountValue) ||
    discountValue < 0 ||
    (discount.type === 'percent' && discountValue > 100)
  )
    partyBookingFailure('Проверьте размер скидки')
  const discountKopecks =
    discount.type === 'percent'
      ? Math.round((subtotalKopecks * discountValue) / 100)
      : partyMoneyKopecks(discountValue)
  if (discountKopecks > subtotalKopecks)
    partyBookingFailure('Скидка не может превышать стоимость заказа')
  if (
    ![servicesKopecks, rentalKopecks, subtotalKopecks, discountKopecks].every(
      Number.isSafeInteger
    )
  )
    partyBookingFailure('Сумма заказа слишком велика')
  return {
    servicesKopecks,
    durationMinutes,
    includedRentalMinutes:
      placeType === 'client_address' ? 0 : includedRentalMinutes,
    rentalMinutes,
    payableMinutes,
    billedHours,
    hourlyRateKopecks: partyMoneyKopecks(hourlyRate),
    rentalKopecks,
    subtotalKopecks,
    discountKopecks,
    totalKopecks: subtotalKopecks - discountKopecks,
  }
}

export const validatePartyRentalContainsProgram = ({
  eventDate,
  dateEnd,
  rental,
  placeType,
}) => {
  if (placeType === 'client_address' || !rental) return
  const starts = +new Date(rental.startsAt),
    ends = +new Date(rental.endsAt)
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts)
    partyBookingFailure('Укажите начало и окончание аренды')
  if (
    !eventDate ||
    !dateEnd ||
    +new Date(eventDate) < starts ||
    +new Date(dateEnd) > ends
  )
    partyBookingFailure('Арендное время должно полностью вмещать программу')
}

export const PARTY_ORDER_SORT_OPTIONS = Object.freeze([
  { value: 'created_desc', label: 'Сначала новые', resource: null },
  { value: 'created_asc', label: 'Сначала старые', resource: null },
  {
    value: 'event_asc',
    label: 'Дата мероприятия: раньше',
    resource: 'orders.eventDate',
  },
  {
    value: 'event_desc',
    label: 'Дата мероприятия: позже',
    resource: 'orders.eventDate',
  },
  {
    value: 'amount_desc',
    label: 'Сумма: больше',
    resource: 'finance.clientAmount',
  },
  {
    value: 'amount_asc',
    label: 'Сумма: меньше',
    resource: 'finance.clientAmount',
  },
])
