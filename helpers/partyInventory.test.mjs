import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateInventoryAvailability,
  normalizeInventoryItem,
  normalizeInventoryServiceItems,
  normalizeInventoryRequirements,
  buildInventoryDemand,
  assertInventoryReferences,
  reconcileInventoryServiceItems,
} from './partyInventory.js'

const resourceId = '507f1f77bcf86cd799439011'
const serviceId = '507f1f77bcf86cd799439012'
const tenantId = '507f1f77bcf86cd799439013'
const another = '507f1f77bcf86cd799439014'
const time = (hour) => `2026-09-03T${hour}:00:00.000Z`
const row = (start, end, quantity, orderId = 'other') => ({
  resourceId,
  serviceId,
  serviceLineId: 'line',
  startAt: time(start),
  endAt: time(end),
  quantity,
  orderId,
})
const item = (quantity = 2, unavailableQuantity = 0) => ({
  _id: resourceId,
  title: 'Колонка',
  quantity,
  unavailableQuantity,
  status: 'active',
})

test('shortage shows overlapping order and exact interval', () => {
  const result = calculateInventoryAvailability({
    items: [item()],
    demand: [row('12', '14', 2)],
    reservations: [row('13', '15', 1)],
  })
  assert.equal(result.warnings.length, 1)
  assert.equal(result.warnings[0].shortage, 1)
  assert.equal(result.warnings[0].startAt, time('13'))
  assert.equal(result.warnings[0].endAt, time('14'))
  assert.equal(result.warnings[0].conflicts[0].orderId, 'other')
})

test('sequential existing reservations are not added together; boundaries are half-open', () => {
  assert.equal(
    calculateInventoryAvailability({
      items: [item()],
      demand: [row('12', '14', 1)],
      reservations: [row('12', '13', 1), row('13', '14', 1)],
    }).hasShortage,
    false
  )
  assert.equal(
    calculateInventoryAvailability({
      items: [item(1)],
      demand: [row('13', '14', 1)],
      reservations: [row('12', '13', 1)],
    }).hasShortage,
    false
  )
})

test('parallel services in the new order share demand and replacing order is excluded', () => {
  const result = calculateInventoryAvailability({
    items: [item(3)],
    demand: [
      row('12', '14', 2),
      { ...row('13', '15', 2), serviceLineId: 'second' },
    ],
    reservations: [row('12', '16', 8, 'edited')],
    excludeOrderId: 'edited',
  })
  assert.equal(result.warnings.length, 1)
  assert.equal(result.warnings[0].shortage, 1)
  assert.equal(result.warnings[0].occupied, 0)
  assert.equal(result.warnings[0].serviceLineIds.length, 2)
})

test('unavailable stock and archived items cannot be allocated; released rows ignored', () => {
  assert.equal(
    calculateInventoryAvailability({
      items: [item(2, 1)],
      demand: [row('12', '13', 2)],
    }).warnings[0].shortage,
    1
  )
  assert.equal(
    calculateInventoryAvailability({
      items: [{ ...item(), status: 'archived' }],
      demand: [row('12', '13', 1)],
    }).hasShortage,
    true
  )
  assert.equal(
    calculateInventoryAvailability({
      items: [item(1)],
      demand: [row('12', '13', 1)],
      reservations: [{ ...row('12', '13', 2), status: 'released' }],
    }).hasShortage,
    false
  )
})

test('norms multiply by service count, manual totals are never multiplied twice', () => {
  const services = normalizeInventoryServiceItems(
    [{ serviceId, quantity: 3 }],
    { eventDate: time('12'), dateEnd: time('13') }
  )
  const requirements = [{ serviceId, items: [{ resourceId, quantity: 2 }] }]
  assert.equal(buildInventoryDemand(services, requirements)[0].quantity, 6)
  assert.equal(
    buildInventoryDemand(
      [{ ...services[0], resources: [{ resourceId, quantity: 4 }] }],
      requirements
    )[0].quantity,
    4
  )
})

test('malformed intervals, duplicate resources and invalid stock quantities are rejected', () => {
  assert.throws(() =>
    normalizeInventoryServiceItems([
      { serviceId, startAt: time('13'), endAt: time('12') },
    ])
  )
  assert.throws(() =>
    normalizeInventoryRequirements([
      { resourceId, quantity: 1 },
      { resourceId, quantity: 2 },
    ])
  )
  assert.throws(() =>
    normalizeInventoryItem({
      title: 'Мяч',
      quantity: 3,
      unavailableQuantity: 4,
    })
  )
  assert.throws(() => normalizeInventoryItem({ title: 'Мяч', quantity: 0.5 }))
})

test('foreign tenant resources and missing service references fail closed', () => {
  assert.throws(
    () =>
      assertInventoryReferences(
        [resourceId],
        [{ _id: resourceId, tenantId: another }],
        tenantId
      ),
    { status: 404 }
  )
  assert.throws(
    () =>
      assertInventoryReferences(
        [resourceId, serviceId],
        [{ _id: resourceId, tenantId }],
        tenantId
      ),
    { status: 404 }
  )
  assert.doesNotThrow(() =>
    assertInventoryReferences(
      [resourceId],
      [{ _id: resourceId, tenantId }],
      tenantId
    )
  )
})

test('automatic order update preserves manual resources and custom intervals, moves default intervals', () => {
  const previous = {
    selectionMode: 'manual',
    orderSnapshot: { eventDate: time('12'), dateEnd: time('14') },
    serviceItems: [
      {
        serviceId,
        serviceLineId: 'first',
        quantity: 2,
        startAt: time('12'),
        endAt: time('14'),
        resources: [{ resourceId, quantity: 3 }],
      },
      {
        serviceId,
        serviceLineId: 'second',
        quantity: 1,
        startAt: time('13'),
        endAt: time('15'),
        resources: [],
      },
      {
        serviceId: tenantId,
        serviceLineId: 'removed',
        quantity: 1,
        startAt: time('12'),
        endAt: time('14'),
      },
    ],
  }
  const result = reconcileInventoryServiceItems(
    {
      servicesIds: [serviceId, another],
      eventDate: time('16'),
      dateEnd: time('18'),
    },
    previous
  )
  assert.equal(result.serviceItems.length, 3)
  assert.equal(result.serviceItems[0].startAt, time('16'))
  assert.equal(result.serviceItems[0].resources[0].quantity, 3)
  assert.equal(result.serviceItems[1].startAt, time('13'))
  assert.equal(result.serviceItems[2].serviceId, another)
  assert.equal(result.serviceItems[2].resources, undefined)
})

test('automatically selected kit remains a snapshot when the order is subsequently edited', () => {
  const result = reconcileInventoryServiceItems(
    { servicesIds: [serviceId], eventDate: time('14'), dateEnd: time('16') },
    {
      selectionMode: 'automatic',
      orderSnapshot: { eventDate: time('12'), dateEnd: time('13') },
      serviceItems: [
        {
          serviceId,
          serviceLineId: 'saved',
          quantity: 1,
          startAt: time('12'),
          endAt: time('13'),
          resources: [{ resourceId, quantity: 2 }],
        },
      ],
    }
  )
  assert.equal(result.serviceItems[0].resources[0].quantity, 2)
  assert.equal(result.serviceItems[0].startAt, time('14'))
})
