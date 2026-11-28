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
import { canPartySetOffsiteOrder, PARTY_OFFSITE_DISABLED_MESSAGE } from '../helpers/partyCompanyModules.js'
import { sharePartyLocationBooking } from '../helpers/partySharedLocationBooking.js'

const minuteMs = 60_000
const dayMs = 86_400_000
const slotMs = 15 * minuteMs

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
  if (!canPartySetOffsiteOrder(context.company, body, selectedOrder))
    partyBookingFailure(PARTY_OFFSITE_DISABLED_MESSAGE, 409, 'partycrm_offsite_disabled')
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
  const preparation = Number(location?.preparationMinutes) || 0
  const cleanup = Number(location?.cleanupMinutes) || 0
  const firstDay = Date.parse(date)
  const dateAt = (index) => new Date(firstDay + index * dayMs).toISOString().slice(0, 10)
  const midnightAt = (index) => +partyDateAtTime(dateAt(index), '00:00', timeZone)
  const bufferedDuration = (duration + cleanup) * minuteMs
  const busy = []
  if (location) {
    // Without a closing time, a late start can still overlap bookings on later days.
    const startBefore = new Date(midnightAt(count) + preparation * minuteMs + (schedule ? 0 : bufferedDuration))
    const endAfter = new Date(midnightAt(0) - (cleanup + (schedule ? 0 : preparation)) * minuteMs)
    const Bookings = await getPartyVenueBookingModel({ readOnly: true })
    const [orders, bookings] = await Promise.all([
      Orders.find({
        tenantId: context.tenantId,
        locationId: location._id,
        bookingVersion: { $ne: 2 },
        status: { $ne: 'canceled' },
        ...(selectedOrder ? { _id: { $ne: selectedOrder._id } } : {}),
        ...getPartyVenueOrderIntervalFilter({ startBefore, endAfter }),
      })
        .select(
          '_id rental eventDate dateEnd durationMinutes partyEventGroupId sharedLocationBooking'
        )
        .lean(),
      Bookings.find({
        tenantId: context.tenantId,
        locationId: location._id,
        sourceType: { $in: ['order_place', 'ticket_session'] },
        startsAt: { $lt: startBefore },
        endsAt: { $gt: endAfter },
      })
        .select('startsAt endsAt sourceType orderId')
        .lean(),
    ])
    for (const order of orders) {
      if (selectedOrder && sharePartyLocationBooking(selectedOrder, order))
        continue
      const endsAt =
        order.dateEnd ||
        new Date(
          +new Date(order.eventDate) +
            (Number(order.durationMinutes) || 60) * minuteMs
        )
      const window = getPartyVenueWindow({ ...order, endsAt }, location)
      if (window) busy.push(window)
    }
    for (const booking of bookings) {
      if (booking.sourceType === 'order_place' && selectedOrder && String(booking.orderId) === String(selectedOrder._id)) continue
      const window = getPartyVenueWindow(booking, location)
      if (window) busy.push(window)
    }
  }
  const days = []
  for (let index = 0; index < count; index++) {
    const day = dateAt(index)
    const window = partyWorkingWindow(day, schedule, timeZone)
    const slots = []
    if (window || !schedule) {
      // Keep the existing grid anchored at the opening time for configured schedules.
      const firstStart = window
        ? +window.startsAt + Math.max(0, Math.ceil(preparation / 15)) * slotMs
        : midnightAt(index)
      const lastStart = window ? +window.endsAt - bufferedDuration : midnightAt(index + 1) - 1
      for (
        let start = firstStart;
        start <= lastStart;
        start += slotMs
      ) {
        const occupiedFrom = new Date(start - preparation * minuteMs)
        const occupiedUntil = new Date(start + bufferedDuration)
        if (
          busy.some((entry) =>
            partyVenueWindowsOverlap({ occupiedFrom, occupiedUntil }, entry)
          )
        )
          continue
        slots.push({
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + duration * minuteMs).toISOString(),
        })
      }
    }
    days.push({ date: day, slots })
  }
  return { configured: true, timeZone, days }
}
