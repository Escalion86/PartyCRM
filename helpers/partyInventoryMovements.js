import {
  inventoryId,
  isInventoryId,
  inventoryValidationError,
} from './partyInventory.js'

export const normalizeInventoryMovement = (body) => {
  const operation = String(body.operation || '')
  const resourceId = inventoryId(body.resourceId)
  const orderId = inventoryId(body.orderId)
  const fromStaffId = inventoryId(body.fromStaffId)
  const toStaffId = inventoryId(body.toStaffId)
  const quantity = Number(body.quantity)
  const idempotencyKey = String(body.idempotencyKey || '')
  const condition = body.condition || 'ok'
  const comment = String(body.comment || '').trim()
  const date = body.expectedReturnAt ? new Date(body.expectedReturnAt) : null
  if (
    !['issue', 'transfer', 'return'].includes(operation) ||
    !isInventoryId(resourceId) ||
    !isInventoryId(orderId)
  )
    throw inventoryValidationError('Проверьте тип операции, реквизит и заказ')
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000)
    throw inventoryValidationError('Укажите положительное целое количество')
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey))
    throw inventoryValidationError('Некорректный идентификатор операции')
  if (
    (operation !== 'issue' && !isInventoryId(fromStaffId)) ||
    (operation !== 'return' && !isInventoryId(toStaffId)) ||
    (operation === 'transfer' && fromStaffId === toStaffId)
  )
    throw inventoryValidationError('Укажите разных отправителя и получателя')
  if (
    !['ok', 'needs_cleaning', 'damaged'].includes(condition) ||
    (operation !== 'return' && condition !== 'ok')
  )
    throw inventoryValidationError('Состояние указывается при возврате')
  if (comment.length > 2000 || (condition !== 'ok' && !comment))
    throw inventoryValidationError(
      'Опишите, что требует внимания (до 2000 символов)'
    )
  if (date && !Number.isFinite(+date))
    throw inventoryValidationError('Некорректный срок возврата')
  return {
    operation,
    resourceId,
    orderId,
    quantity,
    idempotencyKey,
    fromStaffId: operation === 'issue' ? '' : fromStaffId,
    toStaffId: operation === 'return' ? '' : toStaffId,
    expectedReturnAt: date ? date.toISOString() : null,
    condition,
    comment,
  }
}

export const inventoryPhysicalStock = (item, holdings) => {
  const heldQuantity = holdings.reduce(
    (sum, holding) => sum + Number(holding.quantity || 0),
    0
  )
  return {
    heldQuantity,
    physicalQuantity: Math.max(0, Number(item.quantity || 0) - heldQuantity),
    freeQuantity: Math.max(
      0,
      Number(item.quantity || 0) -
        heldQuantity -
        Number(item.unavailableQuantity || 0)
    ),
  }
}

export const validateInventoryMovementQuantity = ({
  movement,
  item,
  holdings,
}) => {
  const stock = inventoryPhysicalStock(item, holdings)
  if (movement.operation === 'issue') {
    if (item.status !== 'active')
      throw inventoryValidationError('Нельзя выдавать архивный реквизит', 409)
    if (movement.quantity > stock.freeQuantity)
      throw inventoryValidationError(
        `На складе доступно ${stock.freeQuantity}; нельзя выдать ${movement.quantity}`,
        409
      )
  } else {
    const source = holdings.find(
      (holding) =>
        inventoryId(holding.holderStaffId) === movement.fromStaffId &&
        inventoryId(holding.orderId) === movement.orderId
    )
    if (!source || movement.quantity > source.quantity)
      throw inventoryValidationError(
        'У указанного сотрудника недостаточно реквизита этого заказа',
        409
      )
  }
  return stock
}

export const validateInventoryStockEdit = (payload, holdings) => {
  const { heldQuantity } = inventoryPhysicalStock(payload, holdings)
  if (heldQuantity && payload.status === 'archived')
    throw inventoryValidationError(
      'Сначала верните выданный реквизит; затем позицию можно архивировать',
      409
    )
  if (payload.quantity < heldQuantity + payload.unavailableQuantity)
    throw inventoryValidationError(
      'Общее количество не может быть меньше выданного и недоступного вместе',
      409
    )
}
