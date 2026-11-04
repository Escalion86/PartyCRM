import { getPartyLocationModel, getPartyOrderModel } from './partyModels'
import { getPartyVenueBookingModel } from './partyVenueBookingModels'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import {
  getPartyVenueWindow,
  getPartyVenueOrderIntervalFilter,
  partyVenueWindowsOverlap,
} from '../helpers/partyVenueBooking.js'
import {
  partyDateAtTime,
  partyWorkingWindow,
} from '../helpers/partyWorkingSchedule.js'
import { partyBookingFailure } from '../helpers/partyOrderBooking.js'
import { sharePartyLocationBooking } from '../helpers/partySharedLocationBooking.js'

export const loadPartyBookingAvailability = async ({ context, body }) => {
  if (
    !canPartyAccess(context, { resource: 'orders.eventDate' }) ||
    !canPartyAccess(context, { resource: 'orders.dateEnd' }) ||
    !(
      canPartyAccess(context, { resource: 'orders', action: 'create' }) ||
      canPartyAccess(context, { resource: 'orders.eventDate', action: 'edit' })
    )
  )
    partyBookingFailure('Нет доступа к подбору времени', 403)
  const date = body.dateFrom
  const count = body.days === undefined ? 1 : Number(body.days)
  const duration = Number(body.durationMinutes)
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 31 ||
    !Number.isSafeInteger(duration) ||
    duration < 1 ||
    duration > 10080
  )
    partyBookingFailure(
      'Выберите период до 31 дня и длительность от одной минуты до семи дней'
    )
  if (!['company_location', 'client_address'].includes(body.placeType))
    partyBookingFailure('Выберите помещение или выезд')
  const Orders = await getPartyOrderModel()
  let selectedOrder = null
  if (body.orderId) {
    if (!/^[a-f\d]{24}$/i.test(body.orderId))
      partyBookingFailure('Некорректный заказ')
    selectedOrder = await Orders.findOne({
      _id: body.orderId,
      tenantId: context.tenantId,
    }).lean()
    if (
      !selectedOrder ||
      !canPartyAccess(context, { resource: 'orders', order: selectedOrder })
    )
      partyBookingFailure('Заказ недоступен', 404)
  }
  let location = null
  if (body.placeType === 'company_location') {
    if (
      !/^[a-f\d]{24}$/i.test(String(body.locationId || '')) ||
      !canPartyAccess(context, { resource: 'orders.locationId' })
    )
      partyBookingFailure('Выберите доступное помещение')
    const scopedIds = context.position?.orderScope?.locationIds
    if (
      (scopedIds?.length && !scopedIds.map(String).includes(body.locationId)) ||
      (context.role === 'location_owner' &&
        !(context.staff.locationIds || [])
          .map(String)
          .includes(body.locationId))
    )
      partyBookingFailure('Помещение недоступно', 404)
    const Locations = await getPartyLocationModel()
    location = await Locations.findOne({
      _id: body.locationId,
      tenantId: context.tenantId,
      status: 'active',
      bookingEnabled: { $ne: false },
    }).lean()
    if (!location)
      partyBookingFailure('Помещение недоступно для бронирования', 404)
  }
  const schedule =
    location?.workingSchedule || context.company.settings?.workingSchedule
  const timeZone = context.company.settings?.timeZone || 'Asia/Krasnoyarsk'
  if (!schedule)
    return {
      configured: false,
      timeZone,
      days: [],
      notice:
        'Рабочий график не настроен. Обратитесь к администратору; заявку можно сохранить без даты.',
    }
  const preparation = Number(location?.preparationMinutes) || 0
  const cleanup = Number(location?.cleanupMinutes) || 0
  const lastDate = new Date(Date.parse(date) + count * 86400000)
    .toISOString()
    .slice(0, 10)
  const from = partyDateAtTime(date, '00:00', timeZone)
  const to = partyDateAtTime(lastDate, '00:00', timeZone)
  const busy = []
  if (location) {
    const Bookings = await getPartyVenueBookingModel({ readOnly: true })
    const [orders, tickets] = await Promise.all([
      Orders.find({
        tenantId: context.tenantId,
        locationId: location._id,
        status: { $ne: 'canceled' },
        ...(selectedOrder ? { _id: { $ne: selectedOrder._id } } : {}),
        ...getPartyVenueOrderIntervalFilter({
          startBefore: new Date(+to + preparation * 60000),
          endAfter: new Date(+from - cleanup * 60000),
        }),
      })
        .select(
          '_id rental eventDate dateEnd durationMinutes partyEventGroupId sharedLocationBooking'
        )
        .lean(),
      Bookings.find({
        tenantId: context.tenantId,
        locationId: location._id,
        sourceType: 'ticket_session',
        startsAt: { $lt: new Date(+to + preparation * 60000) },
        endsAt: { $gt: new Date(+from - cleanup * 60000) },
      })
        .select('startsAt endsAt')
        .lean(),
    ])
    for (const order of orders) {
      if (selectedOrder && sharePartyLocationBooking(selectedOrder, order))
        continue
      const endsAt =
        order.dateEnd ||
        new Date(
          +new Date(order.eventDate) +
            (Number(order.durationMinutes) || 60) * 60000
        )
      const window = getPartyVenueWindow({ ...order, endsAt }, location)
      if (window) busy.push(window)
    }
    for (const ticket of tickets)
      busy.push(getPartyVenueWindow(ticket, location))
  }
  const days = []
  for (let index = 0; index < count; index++) {
    const day = new Date(Date.parse(date) + index * 86400000)
      .toISOString()
      .slice(0, 10)
    const window = partyWorkingWindow(day, schedule, timeZone)
    const slots = []
    if (window)
      for (
        let start = +window.startsAt;
        start + (duration + cleanup) * 60000 <= +window.endsAt;
        start += 15 * 60000
      ) {
        const occupiedFrom = new Date(start - preparation * 60000)
        const occupiedUntil = new Date(start + (duration + cleanup) * 60000)
        if (
          +occupiedFrom < +window.startsAt ||
          busy.some((entry) =>
            partyVenueWindowsOverlap({ occupiedFrom, occupiedUntil }, entry)
          )
        )
          continue
        slots.push({
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + duration * 60000).toISOString(),
        })
      }
    days.push({ date: day, slots })
  }
  return { configured: true, timeZone, days }
}
