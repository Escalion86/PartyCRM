import {
  getPartyOrderModel,
  getPartyServiceModel,
  getPartyStaffModel,
} from './partyModels'
import {
  getPartyInventoryItemModel,
  getPartyInventoryRequirementModel,
  getPartyInventoryReservationModel,
  getPartyInventoryLockModel,
  getPartyInventoryHoldingModel,
} from './partyInventoryModels'
import {
  assertInventoryReferences,
  normalizeInventoryServiceItems,
  buildInventoryDemand,
  calculateInventoryAvailability,
  inventoryValidationError,
  inventoryId,
  isInventoryId,
  reconcileInventoryServiceItems,
} from '@helpers/partyInventory'

export const withPartyInventoryTransaction = async (tenantId, callback) => {
  if (!isInventoryId(tenantId))
    throw inventoryValidationError('Не выбрана компания')
  const Lock = await getPartyInventoryLockModel()
  await Lock.init()
  try {
    await Lock.updateOne(
      { tenantId },
      { $setOnInsert: { tenantId, revision: 0 } },
      { upsert: true }
    )
  } catch (error) {
    if (error.code !== 11000) throw error
  }
  const session = await Lock.db.startSession()
  try {
    return await session.withTransaction(async () => {
      await Lock.updateOne({ tenantId }, { $inc: { revision: 1 } }, { session })
      return callback(session)
    })
  } catch (error) {
    if (
      error.code === 20 ||
      /Transaction numbers are only allowed/.test(error.message)
    ) {
      throw inventoryValidationError(
        'Для безопасного резервирования настройте MongoDB replica set (поддержку транзакций)',
        503
      )
    }
    throw error
  } finally {
    await session.endSession()
  }
}

export const preparePartyInventory = async ({
  tenantId,
  serviceItems,
  eventDate,
  dateEnd,
  orderId = '',
  session = null,
}) => {
  if (!isInventoryId(tenantId) || (orderId && !isInventoryId(orderId)))
    throw inventoryValidationError('Некорректная компания или заказ')
  const normalized = normalizeInventoryServiceItems(serviceItems, {
    eventDate,
    dateEnd,
  })
  const [Services, Items, Requirements, Reservations, Orders] =
    await Promise.all([
      getPartyServiceModel(),
      getPartyInventoryItemModel(),
      getPartyInventoryRequirementModel(),
      getPartyInventoryReservationModel(),
      getPartyOrderModel(),
    ])
  const ids = [...new Set(normalized.map((item) => item.serviceId))]
  // Transaction queries are deliberately sequential: MongoDB sessions do not
  // support concurrent operations in a transaction.
  const services = await Services.find({ tenantId, _id: { $in: ids } })
    .session(session)
    .lean()
  assertInventoryReferences(ids, services, tenantId)
  const requirements = await Requirements.find({
    tenantId,
    serviceId: { $in: ids },
  })
    .session(session)
    .lean()
  const demand = buildInventoryDemand(normalized, requirements)
  const resourceIds = [...new Set(demand.map((item) => item.resourceId))]
  const items = await Items.find({ tenantId, _id: { $in: resourceIds } })
    .session(session)
    .lean()
  assertInventoryReferences(resourceIds, items, tenantId)
  const startAt = demand.length
    ? new Date(Math.min(...demand.map((row) => +new Date(row.startAt))))
    : null
  const endAt = demand.length
    ? new Date(Math.max(...demand.map((row) => +new Date(row.endAt))))
    : null
  const batches = demand.length
    ? await Reservations.find({
        tenantId,
        status: 'active',
        ...(orderId ? { orderId: { $ne: orderId } } : {}),
        rows: {
          $elemMatch: {
            resourceId: { $in: resourceIds },
            startAt: { $lt: endAt },
            endAt: { $gt: startAt },
          },
        },
      })
        .session(session)
        .lean()
    : []
  const orders = await Orders.find({
    tenantId,
    _id: { $in: batches.map((batch) => batch.orderId) },
    status: { $nin: ['canceled'] },
  })
    .select('_id serviceTitle status')
    .session(session)
    .lean()
  const byId = new Map(orders.map((order) => [inventoryId(order), order]))
  const reservations = batches.flatMap((batch) => {
    const order = byId.get(inventoryId(batch.orderId))
    return order
      ? batch.rows.map((row) => ({
          ...row,
          orderId: inventoryId(order),
          orderTitle: order.serviceTitle || 'Заказ',
          status: batch.status,
        }))
      : []
  })
  const Holdings = await getPartyInventoryHoldingModel()
  const holdings = await Holdings.find({
    tenantId,
    resourceId: { $in: resourceIds },
    quantity: { $gt: 0 },
  })
    .session(session)
    .lean()
  const Staff = await getPartyStaffModel()
  const holders = await Staff.find({
    tenantId,
    _id: { $in: holdings.map((holding) => holding.holderStaffId) },
  })
    .select('_id firstName secondName')
    .session(session)
    .lean()
  const holderNames = new Map(
    holders.map((person) => [
      inventoryId(person),
      [person.firstName, person.secondName].filter(Boolean).join(' ') ||
        'Сотрудник',
    ])
  )
  return {
    ...calculateInventoryAvailability({
      items,
      demand,
      reservations,
      holdings: holdings.map((holding) => ({
        ...holding,
        orderId: inventoryId(holding.orderId),
        holderStaffId: inventoryId(holding.holderStaffId),
        holderName:
          holderNames.get(inventoryId(holding.holderStaffId)) || 'Сотрудник',
        orderTitle:
          byId.get(inventoryId(holding.orderId))?.serviceTitle || 'Заказ',
      })),
      excludeOrderId: orderId,
    }),
    serviceItems: normalized,
    items,
  }
}

export const reservePartyOrderInventory = async ({
  tenantId,
  orderId,
  serviceItems,
  confirmShortage = false,
  staffId,
  automatic = false,
}) => {
  if (!isInventoryId(orderId))
    throw inventoryValidationError('Некорректный заказ')
  const Reservations = await getPartyInventoryReservationModel()
  await Reservations.init()
  return withPartyInventoryTransaction(tenantId, async (session) => {
    const Orders = await getPartyOrderModel()
    const order = await Orders.findOne({ _id: orderId, tenantId })
      .session(session)
      .lean()
    if (!order) throw inventoryValidationError('Заказ не найден', 404)
    if (order.status === 'canceled')
      throw inventoryValidationError(
        'Нельзя резервировать реквизит для отменённого заказа'
      )
    const previous = await Reservations.findOne({ tenantId, orderId })
      .session(session)
      .lean()
    if (
      automatic &&
      previous?.status === 'released' &&
      previous.releasedReason === 'manual'
    )
      return { saved: false, released: true }
    const reconciled = reconcileInventoryServiceItems(order, previous)
    if (automatic) serviceItems = reconciled.serviceItems
    const allowed = new Set((order.servicesIds ?? []).map(inventoryId))
    if (
      !Array.isArray(serviceItems) ||
      serviceItems.some((item) => !allowed.has(inventoryId(item.serviceId)))
    )
      throw inventoryValidationError(
        'Добавьте выбранные услуги в заказ перед резервированием'
      )
    const dateEnd =
      order.dateEnd ||
      (order.eventDate
        ? new Date(
            +new Date(order.eventDate) + (order.durationMinutes || 60) * 60000
          )
        : null)
    const availability = await preparePartyInventory({
      tenantId,
      orderId,
      serviceItems,
      eventDate: order.eventDate,
      dateEnd,
      session,
    })
    if (availability.hasShortage && confirmShortage !== true && !automatic)
      return { ...availability, saved: false }
    const snapshotItems = availability.serviceItems.map((item) => ({
      ...item,
      resources: availability.demand
        .filter((row) => row.serviceLineId === item.serviceLineId)
        .map((row) => ({ resourceId: row.resourceId, quantity: row.quantity })),
    }))
    const reservation = await Reservations.findOneAndUpdate(
      { tenantId, orderId },
      {
        $set: {
          tenantId,
          orderId,
          serviceItems: snapshotItems,
          rows: availability.demand,
          selectionMode: automatic
            ? previous?.selectionMode || 'automatic'
            : 'manual',
          orderSnapshot: reconciled.orderSnapshot,
          releasedReason: '',
          status: 'active',
          warnings: availability.warnings,
          shortageConfirmedAt:
            availability.hasShortage && confirmShortage === true
              ? new Date()
              : null,
          shortageConfirmedBy:
            availability.hasShortage && confirmShortage === true
              ? staffId
              : null,
        },
      },
      { upsert: true, new: true, session, runValidators: true }
    ).lean()
    await Orders.updateOne(
      { tenantId, _id: orderId },
      {
        $set: {
          inventoryHasShortage: availability.hasShortage,
          inventorySyncError: '',
          inventoryCheckedAt: new Date(),
        },
      },
      { session }
    )
    return {
      ...availability,
      saved: true,
      requiresShortageConfirmation:
        availability.hasShortage && !confirmShortage,
      reservation,
    }
  })
}

export const releasePartyOrderInventory = async ({
  tenantId,
  orderId,
  reason = 'manual',
}) => {
  if (!isInventoryId(orderId))
    throw inventoryValidationError('Некорректный заказ')
  const Reservations = await getPartyInventoryReservationModel()
  return withPartyInventoryTransaction(tenantId, async (session) => {
    const reservation = await Reservations.findOneAndUpdate(
      { tenantId, orderId },
      { $set: { status: 'released', releasedReason: reason } },
      { new: true, session }
    ).lean()
    const Orders = await getPartyOrderModel()
    await Orders.updateOne(
      { tenantId, _id: orderId },
      {
        $set: {
          inventoryHasShortage: false,
          inventorySyncError: '',
          inventoryCheckedAt: new Date(),
        },
      },
      { session }
    )
    return reservation
  })
}

// This hook runs after an order is durable. An inventory outage must never make
// a successful order creation look like a failed request and invite duplicates.
const syncPartyOrderInventoryResult = async ({
  tenantId,
  order,
  staffId,
  deleted = false,
}) => {
  try {
    const orderId = inventoryId(order)
    const Reservations = await getPartyInventoryReservationModel()
    const existing = await Reservations.findOne({ tenantId, orderId })
      .select('_id')
      .lean()
    if (deleted || order.status === 'canceled') {
      if (existing)
        await releasePartyOrderInventory({ tenantId, orderId, reason: 'order' })
      return { saved: true, released: true }
    }
    // Companies without inventory norms keep their existing order flow.
    if (!existing) {
      const Requirements = await getPartyInventoryRequirementModel()
      if (
        !(await Requirements.exists({
          tenantId,
          serviceId: { $in: order.servicesIds || [] },
          'items.0': { $exists: true },
        }))
      )
        return { skipped: true }
    }
    const result = await reservePartyOrderInventory({
      tenantId,
      orderId,
      staffId,
      automatic: true,
    })
    return {
      saved: result.saved,
      hasShortage: result.hasShortage || false,
      warnings: result.warnings || [],
      requiresShortageConfirmation:
        result.requiresShortageConfirmation || false,
      released: result.released || false,
    }
  } catch (error) {
    return {
      saved: false,
      warning:
        error.status && error.status < 500
          ? error.message
          : 'Заказ сохранён, но резерв реквизита не обновлён. Откройте реквизит заказа и повторите проверку.',
      code: 'inventory_sync_failed',
    }
  }
}

export const syncPartyOrderInventory = async (options) => {
  const result = await syncPartyOrderInventoryResult(options)
  try {
    const Orders = await getPartyOrderModel()
    await Orders.updateOne(
      { _id: inventoryId(options.order), tenantId: options.tenantId },
      {
        $set: {
          inventoryHasShortage: Boolean(result.hasShortage),
          inventorySyncError: result.warning || '',
          inventoryCheckedAt: new Date(),
        },
      }
    )
  } catch {
    // An already saved order must remain successful even if its status flag
    // cannot be refreshed; the immediate response still contains the warning.
  }
  return result
}

export const refreshPartyInventoryResourceWarnings = async ({
  tenantId,
  resourceId,
  session,
}) => {
  const Reservations = await getPartyInventoryReservationModel()
  const Orders = await getPartyOrderModel()
  const batches = await Reservations.find({
    tenantId,
    status: 'active',
    'rows.resourceId': resourceId,
  })
    .session(session)
    .lean()
  for (const batch of batches) {
    const order = await Orders.findOne({
      tenantId,
      _id: batch.orderId,
      status: { $ne: 'canceled' },
    })
      .session(session)
      .lean()
    if (!order) continue
    try {
      const availability = await preparePartyInventory({
        tenantId,
        orderId: inventoryId(order),
        serviceItems: batch.serviceItems,
        eventDate: order.eventDate,
        dateEnd: order.dateEnd,
        session,
      })
      await Reservations.updateOne(
        { tenantId, _id: batch._id },
        { $set: { warnings: availability.warnings } },
        { session }
      )
      await Orders.updateOne(
        { tenantId, _id: order._id },
        {
          $set: {
            inventoryHasShortage: availability.hasShortage,
            inventorySyncError: '',
            inventoryCheckedAt: new Date(),
          },
        },
        { session }
      )
    } catch (error) {
      if (![400, 404].includes(error.status)) throw error
      await Orders.updateOne(
        { tenantId, _id: order._id },
        {
          $set: {
            inventorySyncError:
              'Комплект требует повторной проверки после движения реквизита',
            inventoryCheckedAt: new Date(),
          },
        },
        { session }
      )
    }
  }
}
