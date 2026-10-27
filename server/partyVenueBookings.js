import {
  getPartyVenueLockDays,
  getPartyVenuePeakCapacity,
  getPartyVenueWindow,
  partyVenueFailure,
  partyVenueId,
  partyVenueWindowsOverlap,
  assertPartyVenueConfiguration,
} from '../helpers/partyVenueBooking.js'
import { sharePartyLocationBooking } from '../helpers/partySharedLocationBooking.js'

const loadModels = async ({ readOnly = false } = {}) => {
  const models = await import('./partyModels')
  const bookings = await import('./partyVenueBookingModels')
  return {
    Locations: await models.getPartyLocationModel(),
    Orders: await models.getPartyOrderModel(),
    Bookings: await bookings.getPartyVenueBookingModel({ readOnly }),
    ...(readOnly ? {} : { Locks: await bookings.getPartyVenueLockModel() }),
  }
}
const conflict = (
  message = 'Площадка уже занята в это время с учётом подготовки и уборки'
) => partyVenueFailure(message, 409, 'partycrm_venue_conflict')
const read = (query, session) => query.session(session).lean()
const rangeQuery = (window, location) => ({
  startBefore: new Date(
    +window.occupiedUntil + Number(location.preparationMinutes || 0) * 60000
  ),
  endAfter: new Date(
    +window.occupiedFrom - Number(location.cleanupMinutes || 0) * 60000
  ),
})
const legacyWindow = (order, location) =>
  getPartyVenueWindow(
    {
      startsAt: order.eventDate,
      endsAt:
        order.dateEnd ||
        (order.eventDate
          ? new Date(
              +new Date(order.eventDate) +
                (Number(order.durationMinutes) || 60) * 60000
            )
          : null),
    },
    location
  )

export const supportsPartyVenueTransactions = async (Locations) => {
  const Model =
    Locations || (await (await import('./partyModels')).getPartyLocationModel())
  try {
    const hello = await Model.db.db.admin().command({ hello: 1 })
    return Boolean(hello.setName || hello.msg === 'isdbgrid')
  } catch {
    throw partyVenueFailure(
      'Не удалось проверить поддержку безопасного бронирования',
      503,
      'partycrm_venue_topology_unavailable'
    )
  }
}

// Injectable models let concurrency/rollback tests exercise the mutation without
// opening any database connection. All production writes stay in one session.
export const createPartyVenueBookingService = ({
  getModels = loadModels,
  now = Date.now,
} = {}) => {
  const lockedSessions = new WeakMap()
  const withPartyVenueMutation = async ({
    tenantId,
    bookings = [],
    locationIds = [],
    startsAt,
    endsAt,
    at = null,
    session: externalSession = null,
    work,
  }) => {
    const tenant = partyVenueId(tenantId)
    if (typeof work !== 'function')
      throw partyVenueFailure('Не указано действие бронирования')
    const ranges = [
      ...bookings,
      ...locationIds.map((locationId) => ({ locationId, startsAt, endsAt })),
    ]
    const ids = [
      ...new Set(
        ranges
          .filter((booking) => booking?.locationId)
          .map((booking) => partyVenueId(booking.locationId))
      ),
    ].sort()
    // Validate ranges before any model can cast an attacker-controlled value.
    for (const booking of ranges)
      if (booking?.locationId) getPartyVenueWindow(booking)
    const point = at == null ? null : new Date(at)
    if (point && !Number.isFinite(+point))
      throw partyVenueFailure('Некорректное время входа')
    const models = await getModels()
    await models.Locks.init()
    await models.Bookings.init()
    const session = externalSession || (await models.Locks.db.startSession())
    const execute = async () => {
      const previous = lockedSessions.get(session)
      const locked = new Map(previous || [])
      lockedSessions.set(session, locked)
      try {
        for (const id of ids) {
          // This real write also serializes changes to venue configuration.
          const location = await read(
            models.Locations.findOneAndUpdate(
              { _id: id, tenantId: tenant },
              {
                $inc: { venueBookingRevision: 1 },
                $set: { venueBookingManaged: true },
              },
              { session, returnDocument: 'after' }
            ),
            session
          )
          if (!location)
            throw partyVenueFailure(
              'Площадка не найдена',
              404,
              'partycrm_venue_not_found'
            )
          locked.set(`${tenant}:${id}`, location)
          const days = new Set()
          if (point) days.add(point.toISOString().slice(0, 10))
          for (const booking of ranges.filter(
            (range) => String(range?.locationId).toLowerCase() === id
          )) {
            const window = getPartyVenueWindow(booking, location)
            if (window)
              for (const day of getPartyVenueLockDays(window)) days.add(day)
          }
          for (const day of [...days].sort()) {
            // Unique tenant/location/day + a write, never a find-then-insert
            // availability check. A first-use duplicate aborts safely.
            await models.Locks.updateOne(
              { tenantId: tenant, locationId: id, day },
              { $inc: { revision: 1 } },
              { upsert: true, session }
            )
          }
        }
        return await work({ session })
      } finally {
        if (previous) lockedSessions.set(session, previous)
        else lockedSessions.delete(session)
      }
    }
    try {
      if (externalSession) {
        if (!externalSession.inTransaction?.())
          throw partyVenueFailure(
            'Бронирование должно выполняться в транзакции',
            503,
            'partycrm_venue_transaction_required'
          )
        return await execute()
      }
      return await session.withTransaction(execute)
    } catch (cause) {
      if (
        cause.code === 20 ||
        /Transaction numbers are only allowed|replica set/i.test(
          cause.message || ''
        )
      )
        throw partyVenueFailure(
          'Для безопасного бронирования площадок настройте MongoDB replica set',
          503,
          'partycrm_venue_transaction_required'
        )
      if (cause.code === 11000)
        throw partyVenueFailure(
          'Площадку одновременно бронируют. Повторите действие.',
          409,
          'partycrm_venue_booking_retry'
        )
      throw cause
    } finally {
      if (!externalSession) await session.endSession()
    }
  }

  const reservePartyVenue = async ({
    tenantId,
    sourceType,
    sourceId,
    locationId,
    startsAt,
    endsAt,
    status,
    capacity = null,
    session,
    checkOnly = false,
  }) => {
    const tenant = partyVenueId(tenantId)
    const source = sourceId == null && checkOnly ? null : partyVenueId(sourceId)
    if (!['order', 'ticket_session'].includes(sourceType))
      throw partyVenueFailure('Неизвестный тип бронирования')
    if (
      !(
        sourceType === 'order'
          ? ['draft', 'active', 'closed', 'canceled']
          : ['scheduled', 'completed', 'canceled']
      ).includes(status)
    )
      throw partyVenueFailure('Неизвестный статус бронирования')
    if (
      !checkOnly &&
      (!session?.inTransaction?.() || !lockedSessions.has(session))
    )
      throw partyVenueFailure(
        'Бронирование должно выполняться в транзакции',
        503,
        'partycrm_venue_transaction_required'
      )
    const models = await getModels({ readOnly: checkOnly })
    const filter = { tenantId: tenant, sourceType, sourceId: source }
    const previous = checkOnly
      ? null
      : await read(models.Bookings.findOne(filter), session)
    const lockMap = session && lockedSessions.get(session)
    const location = locationId
      ? checkOnly
        ? await read(
            models.Locations.findOne({
              _id: partyVenueId(locationId),
              tenantId: tenant,
            }),
            session
          )
        : lockMap?.get(`${tenant}:${partyVenueId(locationId)}`)
      : null
    if (checkOnly && locationId && !location)
      throw partyVenueFailure(
        'Площадка не найдена',
        404,
        'partycrm_venue_not_found'
      )
    if (
      (locationId && !location) ||
      (previous && !lockMap?.has(`${tenant}:${String(previous.locationId)}`))
    )
      throw partyVenueFailure(
        'Изменение занятости площадки требует блокировки',
        503,
        'partycrm_venue_lock_required'
      )
    const window = locationId
      ? getPartyVenueWindow({ startsAt, endsAt }, location)
      : null
    if (status === 'canceled' || !locationId || !window) {
      if (!checkOnly) await models.Bookings.deleteOne(filter, { session })
      return null
    }
    if (
      sourceType === 'ticket_session' &&
      (location.status !== 'active' || location.bookingEnabled === false)
    )
      throw conflict('Площадка недоступна для новых сеансов')
    const allocated = sourceType === 'ticket_session' ? Number(capacity) : null
    if (
      sourceType === 'ticket_session' &&
      (typeof capacity === 'boolean' ||
        !Number.isSafeInteger(allocated) ||
        allocated < 1)
    )
      throw partyVenueFailure('Укажите положительную вместимость сеанса')
    const limit =
      Number(location.capacity) > 0 ? Number(location.capacity) : null
    if (allocated && limit && allocated > limit)
      throw conflict('Вместимость сеанса превышает вместимость площадки')
    const { startBefore, endAfter } = rangeQuery(window, location)
    const legacyOrders = await read(
      models.Orders.find({
        tenantId: tenant,
        locationId: location._id,
        status: { $ne: 'canceled' },
        eventDate: { $lt: startBefore },
        ...(sourceType === 'order' && source ? { _id: { $ne: source } } : {}),
        $or: [
          { dateEnd: { $gt: endAfter } },
          {
            dateEnd: null,
            $expr: {
              $gt: [
                {
                  $add: [
                    '$eventDate',
                    {
                      $multiply: [{ $ifNull: ['$durationMinutes', 60] }, 60000],
                    },
                  ],
                },
                endAfter,
              ],
            },
          },
        ],
      }).select(
        '_id locationId eventDate dateEnd durationMinutes status partyEventGroupId sharedLocationBooking'
      ),
      session
    )
    const ownOrder =
      sourceType === 'order' && source
        ? await read(
            models.Orders.findOne({ tenantId: tenant, _id: source }).select(
              '_id partyEventGroupId sharedLocationBooking'
            ),
            session
          )
        : null
    for (const order of legacyOrders) {
      const otherWindow = legacyWindow(order, location)
      if (
        otherWindow &&
        partyVenueWindowsOverlap(window, otherWindow) &&
        !sharePartyLocationBooking(ownOrder, order)
      )
        throw conflict()
    }
    const tickets = await read(
      models.Bookings.find({
        tenantId: tenant,
        locationId: location._id,
        sourceType: 'ticket_session',
        ...(sourceType === 'ticket_session'
          ? { sourceId: { $ne: source } }
          : {}),
        startsAt: { $lt: startBefore },
        endsAt: { $gt: endAfter },
      }),
      session
    )
    const overlaps = tickets
      .map((booking) => ({
        ...booking,
        ...getPartyVenueWindow(booking, location),
      }))
      .filter((booking) => partyVenueWindowsOverlap(window, booking))
    const exclusive = sourceType === 'order' || location.usageMode !== 'shared'
    if (overlaps.length && exclusive) throw conflict()
    if (overlaps.length && !limit)
      throw conflict('Укажите вместимость площадки для совместного режима')
    if (
      overlaps.length &&
      overlaps.some(
        (booking) =>
          !Number.isSafeInteger(booking.capacity) || booking.capacity < 1
      )
    )
      throw conflict('Проверьте вместимость ранее созданных сеансов')
    if (
      !exclusive &&
      limit &&
      getPartyVenuePeakCapacity({ ...window, capacity: allocated }, overlaps) >
        limit
    )
      throw conflict(
        'Суммарная вместимость одновременных сеансов превышает вместимость площадки'
      )
    const booking = {
      ...filter,
      locationId: location._id,
      ...window,
      capacity: allocated,
      exclusive,
    }
    if (!checkOnly)
      await models.Bookings.updateOne(
        filter,
        { $set: booking },
        { upsert: true, session }
      )
    return booking
  }
  const updatePartyVenueConfiguration = async ({
    tenantId,
    locationId,
    patch,
  }) => {
    const tenant = partyVenueId(tenantId)
    const id = partyVenueId(locationId)
    return withPartyVenueMutation({
      tenantId: tenant,
      locationIds: [id],
      work: async ({ session }) => {
        const models = await getModels()
        const current = lockedSessions.get(session).get(`${tenant}:${id}`)
        const location = { ...current, ...patch }
        const after = new Date(
          now() - Number(location.cleanupMinutes || 0) * 60000
        )
        const orders = await read(
          models.Orders.find({
            tenantId: tenant,
            locationId: id,
            status: { $ne: 'canceled' },
            eventDate: { $ne: null },
            $or: [
              { dateEnd: { $gt: after } },
              {
                dateEnd: null,
                $expr: {
                  $gt: [
                    {
                      $add: [
                        '$eventDate',
                        {
                          $multiply: [
                            { $ifNull: ['$durationMinutes', 60] },
                            60000,
                          ],
                        },
                      ],
                    },
                    after,
                  ],
                },
              },
            ],
          }).select(
            '_id eventDate dateEnd durationMinutes partyEventGroupId sharedLocationBooking'
          ),
          session
        )
        const tickets = await read(
          models.Bookings.find({
            tenantId: tenant,
            locationId: id,
            sourceType: 'ticket_session',
            endsAt: { $gt: after },
          }),
          session
        )
        const entries = [
          ...orders.map((order) => ({
            ...order,
            sourceType: 'order',
            ...legacyWindow(order, location),
          })),
          ...tickets.map((booking) => ({
            ...booking,
            ...getPartyVenueWindow(booking, location),
          })),
        ].filter((entry) => +entry.occupiedUntil > now())
        assertPartyVenueConfiguration({
          entries,
          location,
          shareOrders: sharePartyLocationBooking,
        })
        return read(
          models.Locations.findOneAndUpdate(
            { _id: id, tenantId: tenant },
            { $set: patch },
            { session, returnDocument: 'after' }
          ),
          session
        )
      },
    })
  }
  const assertPartyVenueEntryAllowed = async ({
    tenantId,
    locationId,
    at = new Date(now()),
    session,
    excludeTicketSessionId = null,
  }) => {
    const tenant = partyVenueId(tenantId)
    const id = partyVenueId(locationId)
    const ownSession =
      excludeTicketSessionId == null
        ? null
        : partyVenueId(excludeTicketSessionId)
    const point = new Date(at)
    if (!Number.isFinite(+point))
      throw partyVenueFailure('Некорректное время входа')
    const location =
      session?.inTransaction?.() &&
      lockedSessions.get(session)?.get(`${tenant}:${id}`)
    if (!location)
      throw partyVenueFailure(
        'Проверка входа требует блокировки площадки',
        503,
        'partycrm_venue_lock_required'
      )
    const models = await getModels({ readOnly: true })
    const startBefore = new Date(
      +point + Number(location.preparationMinutes || 0) * 60000
    )
    const endAfter = new Date(
      +point - Number(location.cleanupMinutes || 0) * 60000
    )
    const order = await read(
      models.Orders.findOne({
        tenantId: tenant,
        locationId: id,
        status: { $ne: 'canceled' },
        eventDate: { $ne: null, $lte: startBefore },
        $or: [
          { dateEnd: { $gt: endAfter } },
          {
            dateEnd: null,
            $expr: {
              $gt: [
                {
                  $add: [
                    '$eventDate',
                    {
                      $multiply: [{ $ifNull: ['$durationMinutes', 60] }, 60000],
                    },
                  ],
                },
                endAfter,
              ],
            },
          },
        ],
      }).select('_id'),
      session
    )
    let ticket = null
    if (!order && location.usageMode !== 'shared')
      ticket = await read(
        models.Bookings.findOne({
          tenantId: tenant,
          locationId: id,
          sourceType: 'ticket_session',
          ...(ownSession ? { sourceId: { $ne: ownSession } } : {}),
          startsAt: { $lte: startBefore },
          endsAt: { $gt: endAfter },
        }).select('_id'),
        session
      )
    if (order || ticket)
      throw partyVenueFailure(
        'Вход сейчас недоступен: площадка занята эксклюзивным мероприятием',
        409,
        'partycrm_venue_entry_blocked'
      )
    return { allowed: true }
  }
  return {
    withPartyVenueMutation,
    reservePartyVenue,
    updatePartyVenueConfiguration,
    assertPartyVenueEntryAllowed,
    checkPartyVenueAvailability: (args) =>
      reservePartyVenue({
        sourceType: 'order',
        status: 'active',
        ...args,
        checkOnly: true,
      }),
  }
}

const service = createPartyVenueBookingService()
export const withPartyVenueMutation = service.withPartyVenueMutation
export const reservePartyVenue = service.reservePartyVenue
export const updatePartyVenueConfiguration =
  service.updatePartyVenueConfiguration
export const checkPartyVenueAvailability = service.checkPartyVenueAvailability
export const assertPartyVenueEntryAllowed = service.assertPartyVenueEntryAllowed

export const createPartyOrderVenueWriter =
  ({
    getModels = async () => {
      const models = await import('./partyModels')
      return {
        Locations: await models.getPartyLocationModel(),
        Companies: await models.getPartyCompanyModel(),
      }
    },
    supportsTransactions = supportsPartyVenueTransactions,
    withVenueMutation = withPartyVenueMutation,
    reserveVenue = reservePartyVenue,
  } = {}) =>
  async ({
    tenantId,
    previousOrder = null,
    nextOrder = null,
    session: externalSession = null,
    work,
  }) => {
    const tenant = partyVenueId(tenantId)
    const ranges = [previousOrder, nextOrder]
      .filter(
        (order) => order?.locationId && order.placeType !== 'client_address'
      )
      .map((order) => {
        const window = legacyWindow(order, {})
        if (!window) return null
        return {
          locationId: partyVenueId(order.locationId),
          startsAt: window?.startsAt ?? null,
          endsAt: window?.endsAt ?? null,
        }
      })
      .filter(Boolean)
    if (externalSession && !externalSession.inTransaction?.())
      throw partyVenueFailure(
        'Изменение заказа должно выполняться в транзакции',
        503,
        'partycrm_venue_transaction_required'
      )
    if (!ranges.length)
      return work({ session: externalSession, legacy: !externalSession })
    const models = externalSession ? null : await getModels()
    if (!externalSession && !(await supportsTransactions(models.Locations))) {
      const company = await models.Companies.findOne({ _id: tenant })
        .select('settings.modules.ticketing')
        .lean()
      const locations = await models.Locations.find({
        tenantId: tenant,
        _id: { $in: [...new Set(ranges.map((range) => range.locationId))] },
      })
        .select('_id venueBookingManaged')
        .lean()
      if (
        locations.length !==
        new Set(ranges.map((range) => range.locationId)).size
      )
        throw partyVenueFailure(
          'Площадка не найдена',
          404,
          'partycrm_venue_not_found'
        )
      if (
        !company ||
        company.settings?.modules?.ticketing?.enabled === true ||
        locations.some((location) => location.venueBookingManaged)
      )
        throw partyVenueFailure(
          'Для безопасного бронирования площадки настройте MongoDB replica set',
          503,
          'partycrm_venue_transaction_required'
        )
      return work({ session: null, legacy: true })
    }
    return withVenueMutation({
      tenantId: tenant,
      bookings: ranges,
      session: externalSession,
      work: async ({ session }) => {
        const result = await work({ session, legacy: false })
        const window = result?._id ? legacyWindow(result, {}) : null
        if (result?._id)
          await reserveVenue({
            tenantId: tenant,
            sourceType: 'order',
            sourceId: result._id,
            locationId:
              nextOrder && window && result.placeType !== 'client_address'
                ? result.locationId
                : null,
            startsAt: window?.startsAt ?? null,
            endsAt: window?.endsAt ?? null,
            status: nextOrder ? result.status : 'canceled',
            session,
          })
        return result
      },
    })
  }

export const withPartyOrderVenueWrite = createPartyOrderVenueWriter()
