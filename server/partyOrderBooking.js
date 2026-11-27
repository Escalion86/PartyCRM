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
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

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
  const enabled = body.bookingVersion === 1 || previous?.bookingVersion === 1
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
  const result = { ...payload }
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
  result.bookingVersion = 1
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
  if (recalculate) {
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
    result.eventBrief &&
    (body.eventBrief ||
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
          result.eventBrief,
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
