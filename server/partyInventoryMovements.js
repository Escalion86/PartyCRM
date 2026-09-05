import crypto from 'node:crypto'
import { getPartyOrderModel, getPartyStaffModel } from './partyModels'
import {
  getPartyInventoryItemModel,
  getPartyInventoryHoldingModel,
  getPartyInventoryMovementModel,
} from './partyInventoryModels'
import {
  withPartyInventoryTransaction,
  refreshPartyInventoryResourceWarnings,
} from './partyInventory'
import { inventoryId, inventoryValidationError } from '@helpers/partyInventory'
import {
  normalizeInventoryMovement,
  validateInventoryMovementQuantity,
} from '@helpers/partyInventoryMovements'

export const inventoryStaffName = (staff) =>
  [staff?.firstName, staff?.secondName].filter(Boolean).join(' ') || 'Сотрудник'

export const performPartyInventoryMovement = async ({
  tenantId,
  actorStaffId,
  body,
}) => {
  const movement = normalizeInventoryMovement(body)
  const payloadHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({ ...movement, actorStaffId: inventoryId(actorStaffId) })
    )
    .digest('hex')
  const [Items, Holdings, Movements, Staff, Orders] = await Promise.all([
    getPartyInventoryItemModel(),
    getPartyInventoryHoldingModel(),
    getPartyInventoryMovementModel(),
    getPartyStaffModel(),
    getPartyOrderModel(),
  ])
  await Promise.all([Holdings.init(), Movements.init()])
  return withPartyInventoryTransaction(tenantId, async (session) => {
    const repeated = await Movements.findOne({
      tenantId,
      idempotencyKey: movement.idempotencyKey,
    })
      .session(session)
      .lean()
    if (repeated) {
      if (repeated.payloadHash !== payloadHash)
        throw inventoryValidationError(
          'Идентификатор уже использован для другой операции',
          409
        )
      return { movement: repeated, repeated: true }
    }
    const item = await Items.findOne({ tenantId, _id: movement.resourceId })
      .session(session)
      .lean()
    if (!item) throw inventoryValidationError('Реквизит не найден', 404)
    const staffIds = [
      actorStaffId,
      movement.fromStaffId,
      movement.toStaffId,
    ].filter(Boolean)
    const staff = await Staff.find({ tenantId, _id: { $in: staffIds } })
      .session(session)
      .lean()
    const byStaff = new Map(
      staff.map((person) => [inventoryId(person), person])
    )
    const actor = byStaff.get(inventoryId(actorStaffId))
    const from = byStaff.get(movement.fromStaffId)
    const to = byStaff.get(movement.toStaffId)
    if (
      !actor ||
      actor.status !== 'active' ||
      (movement.toStaffId && (!to || to.status !== 'active')) ||
      (movement.fromStaffId && !from)
    )
      throw inventoryValidationError(
        'Сотрудник не найден или получатель не активен в этой компании',
        404
      )
    const order = await Orders.findOne({ tenantId, _id: movement.orderId })
      .session(session)
      .lean()
    if (movement.operation !== 'return' && !order)
      throw inventoryValidationError('Заказ не найден', 404)
    if (
      movement.operation === 'issue' &&
      !['draft', 'active'].includes(order.status)
    )
      throw inventoryValidationError(
        'Выдача разрешена только для принятого или предварительного заказа',
        409
      )
    const holdings = await Holdings.find({
      tenantId,
      resourceId: movement.resourceId,
      quantity: { $gt: 0 },
    })
      .session(session)
      .lean()
    validateInventoryMovementQuantity({ movement, item, holdings })
    const now = new Date()
    const source = holdings.find(
      (holding) =>
        inventoryId(holding.holderStaffId) === movement.fromStaffId &&
        inventoryId(holding.orderId) === movement.orderId
    )
    const target = holdings.find(
      (holding) =>
        inventoryId(holding.holderStaffId) === movement.toStaffId &&
        inventoryId(holding.orderId) === movement.orderId
    )
    const expectedReturnAt =
      movement.operation === 'return'
        ? null
        : movement.expectedReturnAt ||
          source?.expectedReturnAt ||
          target?.expectedReturnAt ||
          null
    if (movement.fromStaffId)
      await Holdings.updateOne(
        { tenantId, _id: source._id },
        { $inc: { quantity: -movement.quantity } },
        { session }
      )
    if (movement.toStaffId) {
      await Holdings.findOneAndUpdate(
        {
          tenantId,
          resourceId: movement.resourceId,
          orderId: movement.orderId,
          holderStaffId: movement.toStaffId,
        },
        {
          $inc: { quantity: movement.quantity },
          $set: { issuedAt: target?.issuedAt || now, expectedReturnAt },
        },
        { session, upsert: true, runValidators: true }
      )
    }
    if (movement.operation === 'return' && movement.condition !== 'ok') {
      const label =
        movement.condition === 'damaged' ? 'Ремонт' : 'Стирка / чистка'
      await Items.updateOne(
        { tenantId, _id: item._id },
        {
          $inc: { unavailableQuantity: movement.quantity },
          $set: {
            unavailableReason: `${label}: ${movement.comment}`.slice(0, 500),
          },
        },
        { session }
      )
    }
    const [record] = await Movements.create(
      [
        {
          ...movement,
          tenantId,
          payloadHash,
          actorStaffId,
          fromStaffId: movement.fromStaffId || null,
          toStaffId: movement.toStaffId || null,
          expectedReturnAt,
          resourceTitle: item.title,
          orderTitle: order?.title || order?.serviceTitle || 'Удалённый заказ',
          fromStaffName: movement.fromStaffId ? inventoryStaffName(from) : '',
          toStaffName: movement.toStaffId ? inventoryStaffName(to) : '',
          actorStaffName: inventoryStaffName(actor),
        },
      ],
      { session }
    )
    await refreshPartyInventoryResourceWarnings({
      tenantId,
      resourceId: movement.resourceId,
      session,
    })
    return { movement: record.toObject(), repeated: false }
  })
}
