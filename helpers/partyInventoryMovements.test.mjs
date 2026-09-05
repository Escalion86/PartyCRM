import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeInventoryMovement,
  inventoryPhysicalStock,
  validateInventoryMovementQuantity,
  validateInventoryStockEdit,
} from './partyInventoryMovements.js'
import { calculateInventoryAvailability } from './partyInventory.js'

const resourceId = '507f1f77bcf86cd799439011'
const orderId = '507f1f77bcf86cd799439012'
const staffId = '507f1f77bcf86cd799439013'
const otherOrder = '507f1f77bcf86cd799439014'
const item = {
  _id: resourceId,
  quantity: 5,
  unavailableQuantity: 1,
  status: 'active',
}
const holdings = [
  {
    resourceId,
    orderId,
    holderStaffId: staffId,
    quantity: 2,
    issuedAt: '2026-09-01T00:00:00Z',
    expectedReturnAt: '2026-09-02T00:00:00Z',
  },
]
const operation = (patch = {}) =>
  normalizeInventoryMovement({
    operation: 'issue',
    resourceId,
    orderId,
    toStaffId: staffId,
    quantity: 1,
    idempotencyKey: 'test_operation_123',
    ...patch,
  })

test('physical stock excludes holders and separates unavailable stock', () => {
  assert.deepEqual(inventoryPhysicalStock(item, holdings), {
    heldQuantity: 2,
    physicalQuantity: 3,
    freeQuantity: 2,
  })
  assert.throws(
    () =>
      validateInventoryMovementQuantity({
        movement: operation({ quantity: 3 }),
        item,
        holdings,
      }),
    { status: 409 }
  )
  assert.doesNotThrow(() =>
    validateInventoryMovementQuantity({
      movement: operation({ quantity: 2 }),
      item,
      holdings,
    })
  )
})
test('partial returns and transfers cannot exceed holder or use another order', () => {
  assert.doesNotThrow(() =>
    validateInventoryMovementQuantity({
      movement: operation({
        operation: 'return',
        fromStaffId: staffId,
        quantity: 1,
      }),
      item,
      holdings,
    })
  )
  assert.throws(
    () =>
      validateInventoryMovementQuantity({
        movement: operation({
          operation: 'return',
          fromStaffId: staffId,
          quantity: 3,
        }),
        item,
        holdings,
      }),
    { status: 409 }
  )
  assert.throws(
    () =>
      validateInventoryMovementQuantity({
        movement: operation({
          operation: 'return',
          fromStaffId: staffId,
          orderId: otherOrder,
        }),
        item,
        holdings,
      }),
    { status: 409 }
  )
})
test('invalid movement quantities, recipients and maintenance comments are rejected', () => {
  for (const quantity of [0, -1, 0.5, 'wrong'])
    assert.throws(() => operation({ quantity }))
  assert.throws(() =>
    operation({ operation: 'transfer', fromStaffId: staffId })
  )
  assert.throws(() =>
    operation({
      operation: 'return',
      fromStaffId: staffId,
      condition: 'damaged',
      comment: '',
    })
  )
  assert.throws(() => operation({ idempotencyKey: 'short' }))
})
test('stock cannot be archived or reduced below held plus unavailable', () => {
  assert.throws(
    () => validateInventoryStockEdit({ ...item, status: 'archived' }, holdings),
    { status: 409 }
  )
  assert.throws(
    () => validateInventoryStockEdit({ ...item, quantity: 2 }, holdings),
    { status: 409 }
  )
  assert.doesNotThrow(() =>
    validateInventoryStockEdit({ ...item, quantity: 3 }, holdings)
  )
})
const row = (quantity, rowOrder = orderId) => ({
  resourceId,
  orderId: rowOrder,
  quantity,
  startAt: '2026-09-10T12:00:00Z',
  endAt: '2026-09-10T13:00:00Z',
  serviceLineId: 'line',
})
test('own issued kit is never counted twice with own proposed reservation', () => {
  const result = calculateInventoryAvailability({
    items: [{ ...item, quantity: 2, unavailableQuantity: 0 }],
    demand: [row(2)],
    excludeOrderId: orderId,
    holdings,
  })
  assert.equal(result.hasShortage, false)
  assert.equal(result.holdingRisks.length, 0)
})
test('foreign holders stay unavailable after promised return and are not double-counted with their reservation', () => {
  const result = calculateInventoryAvailability({
    items: [{ ...item, quantity: 4, unavailableQuantity: 0 }],
    demand: [row(2)],
    excludeOrderId: otherOrder,
    holdings,
    reservations: [row(2)],
  })
  assert.equal(result.hasShortage, false)
  assert.equal(result.holdingRisks.length, 1)
  const shortage = calculateInventoryAvailability({
    items: [{ ...item, quantity: 3, unavailableQuantity: 0 }],
    demand: [row(2)],
    excludeOrderId: otherOrder,
    holdings,
  })
  assert.equal(shortage.warnings[0].shortage, 1)
  assert.equal(shortage.warnings[0].holders[0].holderStaffId, staffId)
})
