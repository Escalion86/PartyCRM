import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyServiceModel,
  getPartyOrderTypeModel,
} from './partyModels'
import {
  ensurePartyOrderTypes,
  normalizePartyOrderTypeTitle,
} from './partyOrderTypes'
import {
  calculatePartyBooking,
  isPartyServiceAvailable,
  partyBookingFailure,
  validatePartyRentalContainsProgram,
  validatePartyServiceQuantity,
  partyMoneyKopecks,
} from '../helpers/partyOrderBooking.js'
import {
  getPartyBriefTemplate,
  getPartyBriefTemplateForOrder,
} from './partyBriefTemplates'
import {
  getPartyBriefAnswer,
  getPartyBriefMissingFields,
  hasPartyBriefAnswer,
} from '../helpers/partyBriefTemplates.js'
import { isPartyWithinWorkingSchedule } from '../helpers/partyWorkingSchedule.js'
import { calculatePartyServiceConfiguration } from '../helpers/partyServiceConfiguration.js'
import { canEditPartyOrderPlaces, canPartyAccess } from '../helpers/partyRolePermissions.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { calculatePartyMultiPlaceTotal, calculatePartyPlaceBooking } from '../helpers/partyMultiPlaceBooking.js'
import { formatAddressPoolShort } from '../helpers/addressPool.js'

const changed = (body, field) => Object.hasOwn(body, field)

const buildServiceItem = ({ service, selection, prior, order, sameContext }) => {
  const snapshot = prior?.serviceConfiguration
  const hasParameters = changed(selection, 'parameters')
  const definition =
    snapshot?.definition || (!prior || hasParameters ? service?.configuration : null)
  const sameQuantity = prior && Number(prior.quantity) === Number(selection.quantity)
  if (sameQuantity && sameContext && !hasParameters) return { ...prior }
  if (hasParameters && !definition)
    partyBookingFailure(
      'Обновите список услуг: настройки выбранной услуги больше недоступны',
      400,
      'partycrm_service_configuration_unavailable'
    )

  const basePrice = snapshot?.basePrice ?? service?.price ?? 0
  const baseDuration = snapshot?.baseDuration ?? service?.duration ?? 0
  const calculation = definition && (!snapshot || hasParameters)
    ? calculatePartyServiceConfiguration(
        { configuration: definition, price: basePrice, duration: baseDuration },
        selection.parameters
      )
    : null
  const parametersChanged = calculation && (
    !snapshot || JSON.stringify(calculation.parameters) !== JSON.stringify(snapshot.parameters)
  )
  if (sameQuantity && sameContext && !parametersChanged) return { ...prior }
  if (!isPartyServiceAvailable(service, order))
    partyBookingFailure(
      `Услуга «${service?.title || 'не найдена'}» недоступна для выбранного типа и места`
    )
  if (sameQuantity && !parametersChanged) return { ...prior }

  const quantity = validatePartyServiceQuantity(service, selection.quantity)
  const unitPrice = parametersChanged ? calculation.unitPrice : prior?.unitPrice ?? service.price ?? 0
  const unitPriceKopecks = partyMoneyKopecks(unitPrice)
  const discount = prior?.discount ?? 0
  const item = prior || {
    serviceId: service._id,
    title: service.title,
    description: (service.description || '').slice(0, 1000),
    unit: 'услуга',
    durationMinutes: Number(service.duration) || null,
    includedRentalMinutes: service.includedRentalMinutes || 0,
  }
  return {
    ...item,
    ...(parametersChanged ? {
      durationMinutes: calculation.durationMinutes || null,
      serviceConfiguration: {
        definition,
        parameters: calculation.parameters,
        details: calculation.details,
        basePrice,
        baseDuration,
      },
    } : {}),
    quantity,
    unitPrice,
    discount,
    total: (unitPriceKopecks * quantity - partyMoneyKopecks(discount)) / 100,
  }
}

const hasConfiguredService = (order) =>
  (order?.orderItems || []).some((item) => item.serviceConfiguration)
const timestamp = (value) => value ? +new Date(value) : null
const objectIdPattern = /^[a-f\d]{24}$/i
const bookingItemIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const sameId = (left, right) => String(left || '') === String(right || '')

const managedMultiPlaceFields = [
  'placeType', 'locationId', 'customAddress', 'clientAddress', 'eventDate',
  'dateEnd', 'durationMinutes', 'rental', 'serviceSelections', 'servicesIds',
  'serviceTitle', 'orderItems', 'contractAmount',
]

const requireMultiPlaceEditor = () => partyBookingFailure(
  'Откройте мастер заказа, чтобы изменить площадки и их услуги',
  409,
  'partycrm_multi_place_editor_required'
)

const parseOptionalBookingInstant = (value) => {
  if (value == null || value === '') return null
  const date = parsePartyIsoDate(value)
  if (!date) partyBookingFailure('Укажите корректные дату и время бронирования')
  return date
}

const parsePlaceRental = (value) => {
  if (value != null && !isRecord(value)) partyBookingFailure('Проверьте интервал аренды')
  const startsAt = parseOptionalBookingInstant(value?.startsAt)
  const endsAt = parseOptionalBookingInstant(value?.endsAt)
  if (startsAt == null && endsAt == null) return null
  if (!startsAt || !endsAt || endsAt <= startsAt)
    partyBookingFailure('Укажите начало и окончание аренды')
  return { startsAt, endsAt }
}

const nextMultiPlaceSelections = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    partyBookingFailure('Выберите от одной до десяти площадок')
  const placeIds = new Set(), locationIds = new Set(), serviceLineIds = new Set()
  for (const place of value) {
    if (!isRecord(place) || typeof place.id !== 'string' || !bookingItemIdPattern.test(place.id) ||
        typeof place.locationId !== 'string' || !objectIdPattern.test(place.locationId) ||
        placeIds.has(place.id) || locationIds.has(place.locationId.toLowerCase()) ||
        !Array.isArray(place.serviceSelections))
      partyBookingFailure('Проверьте выбранные площадки и программу')
    placeIds.add(place.id)
    locationIds.add(place.locationId.toLowerCase())
    const services = new Set()
    for (const selection of place.serviceSelections) {
      if (!isRecord(selection) || typeof selection.lineId !== 'string' ||
          !bookingItemIdPattern.test(selection.lineId) || serviceLineIds.has(selection.lineId) ||
          typeof selection.serviceId !== 'string' || !objectIdPattern.test(selection.serviceId) ||
          services.has(selection.serviceId.toLowerCase()))
        partyBookingFailure('Проверьте выбранные позиции услуг на площадке')
      services.add(selection.serviceId.toLowerCase())
      serviceLineIds.add(selection.lineId)
      if (serviceLineIds.size > 100)
        partyBookingFailure('Допускается до 100 позиций услуг на заказ')
    }
  }
  return value
}

const checkPlaceWorkingHours = ({ place, location, context }) => {
  if (!place.rental) return
  validatePartyRentalContainsProgram(place)
  if (!isPartyWithinWorkingSchedule({
    startsAt: new Date(+place.rental.startsAt - (Number(location.preparationMinutes) || 0) * 60000),
    endsAt: new Date(+place.rental.endsAt + (Number(location.cleanupMinutes) || 0) * 60000),
    schedule: location.workingSchedule || context.company.settings?.workingSchedule,
    timeZone: context.company.settings?.timeZone || 'Asia/Krasnoyarsk',
  }))
    partyBookingFailure(`Аренда площадки «${location.title}» с учётом подготовки и уборки выходит за рабочий график`)
}

const activePlaceItems = ({ selections, services, previous, previousPlace, place, sameType }) => {
  const legacyPlace = previous?.bookingVersion !== 2 && sameId(previous?.locationId, place.locationId)
  const oldItems = previous?.orderItems || []
  return selections.map((selection) => {
    const service = services.get(selection.serviceId.toLowerCase())
    const prior = oldItems.find((item) =>
      sameId(item.serviceId, selection.serviceId.toLowerCase()) &&
      (legacyPlace || item.lineId === selection.lineId)
    )
    return {
      ...buildServiceItem({
        service,
        selection,
        prior,
        order: place,
        sameContext: sameType && (legacyPlace || (prior?.placeId === place.id &&
          sameId(previousPlace?.locationId, place.locationId))),
      }),
      lineId: selection.lineId,
      placeId: place.id,
    }
  })
}

const validateMultiPlaceAssignments = (result) => {
  const places = new Set(result.places.map(({ id }) => id))
  const ids = new Set()
  for (const assignment of result.assignedStaff || []) {
    if (assignment.placeId && !places.has(assignment.placeId))
      partyBookingFailure('Выберите действующую площадку для исполнителя')
    const staffId = String(assignment.staffId)
    if (ids.has(staffId)) partyBookingFailure('Исполнителя можно назначить на заказ только один раз')
    ids.add(staffId)
  }
}

const prepareMultiPlaceBooking = async ({ context, body, result, previous }) => {
  const isExisting = previous?.bookingVersion === 2
  const supplied = changed(body, 'places')
  if (body.bookingVersion === 1 || supplied && body.bookingVersion !== 2 ||
      !supplied && !isExisting ||
      !supplied && managedMultiPlaceFields.some((key) => changed(body, key) &&
        JSON.stringify(body[key]) !== JSON.stringify(previous[key])) ||
      !supplied && !sameId(result.orderTypeId, previous?.orderTypeId))
    requireMultiPlaceEditor()
  if (!isExisting && (previous?.agreedProposal?.proposalId || previous?.agreedProposal?.snapshotHash || previous?.sharedLocationBooking ||
      previous?.orderItems?.some((item) => !item.serviceId)))
    partyBookingFailure('Согласованные позиции или общая бронь заказа требуют отдельного переноса', 409, 'partycrm_multi_place_conversion_blocked')
  if (body.placeType === 'client_address') partyBookingFailure('Для многоместной брони выберите площадки компании')
  const requiredTimes = body.completeBooking === true || result.status === 'active'
  const orderItems = supplied ? [] : previous.orderItems
  let places = previous?.places

  if (supplied) {
    const input = nextMultiPlaceSelections(body.places)
    const permissionsOrder = {
      ...result, bookingVersion: 2, tenantId: context.tenantId,
      locationId: input[0].locationId.toLowerCase(),
      places: input.map(({ locationId }) => ({ locationId: locationId.toLowerCase() })),
    }
    if (!canEditPartyOrderPlaces(context, permissionsOrder) ||
        previous && !canPartyAccess(context, { resource: 'orders', order: previous }))
      partyBookingFailure('Недостаточно прав для изменения площадок, услуг или времени заказа', 403, 'partycrm_forbidden_order_fields')
    const serviceIds = [...new Set(input.flatMap(({ serviceSelections }) => serviceSelections.map(({ serviceId }) => serviceId.toLowerCase())))]
    const locationIds = input.map(({ locationId }) => locationId)
    const [Locations, Services] = await Promise.all([getPartyLocationModel(), getPartyServiceModel()])
    const [locationRows, serviceRows] = await Promise.all([
      Locations.find({ tenantId: context.tenantId, _id: { $in: locationIds }, status: 'active', bookingEnabled: { $ne: false } }).lean(),
      serviceIds.length ? Services.find({ tenantId: context.tenantId, _id: { $in: serviceIds } }).lean() : [],
    ])
    const locations = new Map(locationRows.map((row) => [String(row._id), row]))
    const services = new Map(serviceRows.map((row) => [String(row._id), row]))
    const oldPlaces = new Map((previous?.places || []).map((place) => [place.id, place]))
    places = input.map((entry) => {
      const location = locations.get(entry.locationId.toLowerCase())
      if (!location) partyBookingFailure('Одна из площадок недоступна для бронирования')
      const guestCount = entry.guestCount == null || entry.guestCount === '' ? null : Number(entry.guestCount)
      if (guestCount != null && (!['string', 'number'].includes(typeof entry.guestCount) ||
          !Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 100000 ||
          (location.capacity > 0 && guestCount > location.capacity)))
        partyBookingFailure(`Проверьте количество гостей на площадке «${location.title}»`)
      const rental = parsePlaceRental(entry.rental)
      const start = parseOptionalBookingInstant(entry.eventDate)
      if (!rental && start)
        partyBookingFailure(`Для площадки «${location.title}» укажите интервал аренды`)
      const previousPlace = oldPlaces.get(entry.id)
      const place = {
        id: entry.id,
        locationId: location._id,
        locationTitle: location.title,
        locationAddress: formatAddressPoolShort({ ...location.address, comment: '' }),
        timeZone: context.company.settings?.timeZone || 'Asia/Krasnoyarsk',
        guestCount,
        rental,
      }
      const items = activePlaceItems({
        selections: entry.serviceSelections, services, previous, previousPlace,
        place: { ...place, placeType: 'company_location', orderTypeId: result.orderTypeId },
        sameType: sameId(previous?.orderTypeId, result.orderTypeId),
      })
      const legacySamePlace = !isExisting && sameId(previous?.locationId, location._id)
      const quote = calculatePartyPlaceBooking({
        location,
        rental,
        items,
        parameters: entry.parameters,
        locationConfiguration: sameId(previousPlace?.locationId, location._id)
          ? previousPlace.locationConfiguration
          : legacySamePlace && previous?.pricingSnapshot && !location.rentalConfiguration
            ? { definition: null, baseHourlyRate: previous.pricingSnapshot.hourlyRateKopecks / 100 }
            : undefined,
      })
      const programMinutes = quote.pricingSnapshot.durationMinutes
      if (!Number.isFinite(programMinutes) || programMinutes < 0 || programMinutes > 10080)
        partyBookingFailure(`Сократите программу площадки «${location.title}» до семи дней`)
      const eventDate = rental ? (programMinutes > 0 ? start || rental.startsAt : rental.startsAt) : null
      const dateEnd = eventDate && (programMinutes > 0 ? new Date(+eventDate + programMinutes * 60000) : rental.endsAt)
      const datedPlace = {
        ...place, ...quote, eventDate, dateEnd,
        durationMinutes: Math.ceil(programMinutes || quote.pricingSnapshot.rentalMinutes || 0),
      }
      checkPlaceWorkingHours({ place: datedPlace, location, context })
      let cursor = eventDate && +eventDate
      for (const item of items) {
        const minutes = (item.durationMinutes || 0) * item.quantity
        const scheduled = cursor != null && minutes > 0
        const endsAt = scheduled ? cursor + minutes * 60000 : null
        orderItems.push({ ...item, eventDate: scheduled ? new Date(cursor) : null, dateEnd: scheduled ? new Date(endsAt) : null })
        if (scheduled) cursor = endsAt
      }
      return datedPlace
    })
  }
  if (requiredTimes && places.some((place) => !place.rental || !place.eventDate || !place.dateEnd))
    partyBookingFailure('Для подтверждения укажите время аренды всех площадок')
  if (requiredTimes && (!result.orderTypeId || !result.clientId))
    partyBookingFailure('Для подтверждения выберите тип заказа и клиента')
  const discount = changed(body, 'discount') ? body.discount : previous?.discount || { type: 'amount', value: 0 }
  const pricingSnapshot = calculatePartyMultiPlaceTotal(places, discount)
  const scheduled = places.filter((place) => place.eventDate && place.dateEnd)
  const eventDate = scheduled.length ? new Date(Math.min(...scheduled.map((place) => +place.eventDate))) : null
  const dateEnd = scheduled.length ? new Date(Math.max(...scheduled.map((place) => +place.dateEnd))) : null
  const contractAmount = pricingSnapshot.totalKopecks / 100
  const next = {
    ...result,
    bookingVersion: 2,
    places,
    orderItems,
    placeType: 'company_location',
    locationId: places[0].locationId,
    rental: places[0].rental,
    customAddress: '',
    clientAddress: {},
    eventDate, dateEnd,
    durationMinutes: pricingSnapshot.durationMinutes || 60,
    discount,
    pricingSnapshot,
    contractAmount,
    clientPayment: { ...result.clientPayment, totalAmount: contractAmount },
    servicesIds: [...new Set(orderItems.map((item) => String(item.serviceId)))],
    serviceTitle: orderItems.map((item) => item.title).join(', ').slice(0, 180),
  }
  validateMultiPlaceAssignments(next)
  return next
}

export const validatePartyBookingBriefAnswers = async ({
  tenantId,
  order,
  template,
  previous,
}) => {
  for (const field of template.fields || []) {
    const value = getPartyBriefAnswer(order.eventBrief, field)
    if (!hasPartyBriefAnswer(value) || field.type === 'note') continue
    if (
      ['text', 'textarea'].includes(field.type) &&
      (typeof value !== 'string' || value.length > 20000)
    )
      partyBookingFailure(`Проверьте ответ «${field.label}»`)
    if (
      field.type === 'number' &&
      (typeof value !== 'number' || !Number.isFinite(value))
    )
      partyBookingFailure(`Укажите число: «${field.label}»`)
    if (field.type === 'money') partyMoneyKopecks(value)
    if (field.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      partyBookingFailure(`Укажите время: «${field.label}»`)
    if (
      field.type === 'date' &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      partyBookingFailure(`Укажите дату: «${field.label}»`)
    if (
      field.type === 'datetime' &&
      (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    )
      partyBookingFailure(`Укажите дату и время: «${field.label}»`)
    if (field.type === 'checkbox' && typeof value !== 'boolean')
      partyBookingFailure(`Выберите ответ: «${field.label}»`)
    if (field.type === 'contact') {
      const clientId = value?.clientId
      const prior = getPartyBriefAnswer(previous?.eventBrief, field)
      if (String(prior?.clientId || '') === String(clientId || ''))
        for (const key of ['name', 'phone', 'email'])
          if (!Object.hasOwn(value, key) && Object.hasOwn(prior || {}, key)) value[key] = prior[key]
      const Clients = await getPartyClientModel()
      if (
        !/^[a-f\d]{24}$/i.test(String(clientId || '')) ||
        !(await Clients.exists({ _id: clientId, tenantId }))
      )
        partyBookingFailure(`Выберите контакт компании: «${field.label}»`)
    }
  }
}

export const preparePartyOrderBooking = async ({
  context,
  body,
  payload,
  previous = null,
}) => {
  // Legacy requests keep their original pricing and timing until explicitly converted.
  const multiPlace = body.bookingVersion === 2 || previous?.bookingVersion === 2
  const enabled = multiPlace || body.bookingVersion === 1 || previous?.bookingVersion === 1
  const bookingFields = [
    'orderTypeId',
    'serviceSelections',
    'servicesIds',
    'rental',
    'discount',
    'eventDate',
    'dateEnd',
    'durationMinutes',
    'placeType',
    'locationId',
  ]
  const recalculate =
    !previous ||
    (body.bookingVersion === 1 && previous.bookingVersion !== 1) ||
    bookingFields.some(
      (field) =>
        changed(body, field) &&
        JSON.stringify(body[field]) !== JSON.stringify(previous[field])
    )
  let result = { ...payload }
  for (const field of [
    'orderTypeId',
    'orderTypeSnapshot',
    'bookingVersion',
    'rental',
    'discount',
    'pricingSnapshot',
  ]) {
    if (previous && Object.hasOwn(previous, field))
      result[field] = previous[field]
  }
  if (!enabled) {
    if (body.orderTypeId)
      partyBookingFailure(
        'Откройте последовательную форму для выбора типа заказа'
      )
    return result
  }
  result.bookingVersion = multiPlace ? 2 : 1
  if (hasConfiguredService(previous)) {
    // The generic payload accepts legacy order items. A configured line is
    // changed through selections only, using its original rules.
    result.orderItems = previous.orderItems
    result.contractAmount = previous.contractAmount
    result.clientPayment = {
      ...result.clientPayment,
      totalAmount: previous.clientPayment?.totalAmount ?? previous.contractAmount,
    }
  }
  const orderTypeId = changed(body, 'orderTypeId')
    ? body.orderTypeId
    : previous?.orderTypeId
  if (orderTypeId) {
    if (!/^[a-f\d]{24}$/i.test(String(orderTypeId)))
      partyBookingFailure('Выберите тип заказа')
    const Types = await getPartyOrderTypeModel()
    const type = await Types.findOne({
      _id: orderTypeId,
      tenantId: context.tenantId,
    }).lean()
    if (
      !type ||
      (!type.active && String(previous?.orderTypeId) !== String(orderTypeId))
    )
      partyBookingFailure('Тип заказа недоступен')
    result.orderTypeId = type._id
    result.orderTypeSnapshot =
      String(previous?.orderTypeId) === String(orderTypeId) &&
      previous?.orderTypeSnapshot
        ? previous.orderTypeSnapshot
        : type.title
    result.title = result.orderTypeSnapshot
  } else {
    result.orderTypeId = null
    result.orderTypeSnapshot = ''
    if (!previous) result.title = ''
  }
  if (
    previous &&
    String(previous.orderTypeId || '') !== String(orderTypeId || '')
  ) {
    const oldTemplate = await getPartyBriefTemplateForOrder({
      tenantId: context.tenantId,
      order: previous,
    })
    const archived = [
      ...(previous.eventBrief?.archivedAnswers || []),
      ...(body.eventBrief?.archivedAnswers || []),
    ]
    for (const field of [
      ...(oldTemplate.fields || []),
      ...(oldTemplate.retiredFields || []),
    ]) {
      const value = getPartyBriefAnswer(previous.eventBrief, field)
      if (
        hasPartyBriefAnswer(value) &&
        !archived.some(
          (answer) =>
            answer.field?.id === field.id &&
            JSON.stringify(answer.value) === JSON.stringify(value)
        )
      )
        archived.push({ field, value })
    }
    result.eventBrief = {
      customAnswers: body.eventBrief?.customAnswers || {},
      archivedAnswers: archived,
      templateSnapshot: null,
    }
  }
  if (multiPlace) {
    result = await prepareMultiPlaceBooking({ context, body, result, previous })
  } else if (recalculate) {
    if (!changed(body, 'serviceSelections') && changed(body, 'servicesIds') && !Array.isArray(body.servicesIds))
      partyBookingFailure('Проверьте выбранные услуги')
    const selections = changed(body, 'serviceSelections')
      ? body.serviceSelections
      : changed(body, 'servicesIds')
        ? body.servicesIds.map((serviceId) => ({
            serviceId,
            quantity:
              (previous?.orderItems || []).find(
                (item) => String(item.serviceId) === String(serviceId)
              )?.quantity || 1,
          }))
        : (previous?.orderItems || [])
            .filter((item) => item.serviceId)
            .map((item) => ({
              serviceId: String(item.serviceId),
              quantity: item.quantity,
            }))
    if (
      !Array.isArray(selections) ||
      selections.length > 200 ||
      selections.some(
        (item) => !/^[a-f\d]{24}$/i.test(String(item?.serviceId || ''))
      )
    )
      partyBookingFailure('Проверьте выбранные услуги')
    const ids = selections.map((item) => String(item.serviceId))
    if (new Set(ids).size !== ids.length)
      partyBookingFailure('Укажите услугу одной строкой с нужным количеством')
    const Services = await getPartyServiceModel()
    const services = ids.length
      ? await Services.find({
          tenantId: context.tenantId,
          _id: { $in: ids },
        }).lean()
      : []
    const byId = new Map(
      services.map((service) => [String(service._id), service])
    )
    const sameContext =
      previous &&
      String(previous.orderTypeId) === String(result.orderTypeId) &&
      previous.placeType === result.placeType &&
      String(previous.locationId) === String(result.locationId)
    result.orderItems = selections.map((selection) =>
      buildServiceItem({
        service: byId.get(String(selection.serviceId)),
        selection,
        prior: (previous?.orderItems || []).find(
          (item) => String(item.serviceId) === String(selection.serviceId)
        ),
        order: result,
        sameContext,
      })
    )
    result.orderItems.push(
      ...(previous?.orderItems || []).filter((item) => !item.serviceId)
    )
    result.servicesIds = ids
    result.serviceTitle = result.orderItems
      .map((item) => item.title)
      .join(', ')
      .slice(0, 180)
    result.rental =
      result.placeType === 'client_address'
        ? null
        : changed(body, 'rental')
          ? body.rental
          : previous?.rental || null
    result.discount = changed(body, 'discount')
      ? body.discount
      : previous?.discount || { type: 'amount', value: 0 }
    let location = null
    if (result.placeType !== 'client_address' && result.locationId) {
      const Locations = await getPartyLocationModel()
      location = await Locations.findOne({
        _id: result.locationId,
        tenantId: context.tenantId,
      }).lean()
      if (
        !location ||
        location.status !== 'active' ||
        location.bookingEnabled === false
      )
        partyBookingFailure('Помещение недоступно для бронирования')
      if (location.rentalConfiguration && !sameId(previous?.locationId, location._id))
        requireMultiPlaceEditor()
    }
    const hourlyRate =
      previous?.pricingSnapshot &&
      String(previous.locationId) === String(result.locationId)
        ? Number(previous.pricingSnapshot.hourlyRateKopecks || 0) / 100
        : location?.hourlyRentalRate || 0
    const calculation = calculatePartyBooking({
      items: result.orderItems,
      rental: result.rental,
      hourlyRate,
      placeType: result.placeType,
      discount: result.discount,
    })
    result.pricingSnapshot = calculation
    result.contractAmount = calculation.totalKopecks / 100
    result.clientPayment = {
      ...result.clientPayment,
      totalAmount: result.contractAmount,
    }
    result.durationMinutes =
      calculation.durationMinutes ||
      (result.rental ? calculation.rentalMinutes : 60)
    const includesConfiguration = hasConfiguredService(result) || hasConfiguredService(previous)
    if (result.eventDate && (calculation.durationMinutes || (includesConfiguration && !result.rental)))
      result.dateEnd = new Date(
        +new Date(result.eventDate) + result.durationMinutes * 60000
      )
    else if (!calculation.durationMinutes && result.rental) {
      result.eventDate = new Date(result.rental.startsAt)
      result.dateEnd = new Date(result.rental.endsAt)
    } else if (!result.eventDate) result.dateEnd = null
    if (includesConfiguration && (result.eventDate || previous?.eventDate)) {
      const timing = previous || {}
      for (const field of ['eventDate', 'dateEnd']) {
        if (timestamp(timing[field]) !== timestamp(result[field]) &&
          !canPartyAccess(context, { resource: `orders.${field}`, action: 'edit', order: previous || result }))
          partyBookingFailure(
            'Недостаточно прав для изменения времени заказа',
            403,
            'partycrm_forbidden_order_fields'
          )
      }
    }
    if (result.eventDate) {
      if (location && !result.rental)
        partyBookingFailure('Укажите отдельный интервал аренды')
      validatePartyRentalContainsProgram(result)
      const startsAt = new Date(
        +new Date(result.rental?.startsAt || result.eventDate) -
          (Number(location?.preparationMinutes) || 0) * 60000
      )
      const endsAt = new Date(
        +new Date(result.rental?.endsAt || result.dateEnd) +
          (Number(location?.cleanupMinutes) || 0) * 60000
      )
      if (
        !isPartyWithinWorkingSchedule({
          startsAt,
          endsAt,
          schedule:
            location?.workingSchedule ||
            context.company.settings?.workingSchedule,
          timeZone: context.company.settings?.timeZone || 'Asia/Krasnoyarsk',
        })
      )
        partyBookingFailure(
          'Выбранное время с учётом подготовки и уборки не входит в рабочий график. Выберите свободный интервал.'
        )
    }
  }
  if (
    (result.eventBrief || multiPlace && body.completeBooking === true) &&
    ((multiPlace && body.completeBooking === true) || body.eventBrief ||
      !previous ||
      result.orderTypeId !== previous.orderTypeId)
  ) {
    const template = await getPartyBriefTemplate(
      context.tenantId,
      result.orderTypeId
    )
    await validatePartyBookingBriefAnswers({
      tenantId: context.tenantId,
      order: result,
      template,
      previous,
    })
    if (body.completeBooking === true) {
      if (!result.orderTypeId || !result.eventDate || !result.clientId)
        partyBookingFailure('Для завершения выберите тип, время и клиента')
      if (
        result.placeType === 'client_address' &&
        !(result.pricingSnapshot?.durationMinutes > 0)
      )
        partyBookingFailure(
          'Для выездного заказа добавьте услугу с указанной длительностью'
        )
      if (
        getPartyBriefMissingFields(
          result.eventBrief || {},
          template,
          result.servicesIds
        ).length
      )
        partyBookingFailure('Заполните обязательные вопросы брифа', 400, 'partycrm_booking_brief_required')
    }
  }
  return result
}

export const linkPartyLegacyOrderType = async ({ context, order }) => {
  if (order.orderTypeId || !order.title) return order
  const Types = await ensurePartyOrderTypes(context.company)
  const match = await Types.findOne({
    tenantId: context.tenantId,
    normalizedTitle: normalizePartyOrderTypeTitle(order.title),
  }).lean()
  return match
    ? { ...order, orderTypeId: match._id, orderTypeSnapshot: match.title }
    : order
}
