import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canPartyInventoryAccess,
  collectPartyInventoryOrderIds,
  filterPartyInventoryData,
} from './partyInventoryAccess.js'

const actor = (permissions = {}, role = 'performer') => ({
  tenantId: 'tenant',
  role,
  staff: {
    _id: 'person',
    tenantId: 'tenant',
    status: 'active',
    role,
    positionId: 'position',
  },
  position: {
    _id: 'position',
    tenantId: 'tenant',
    active: true,
    permissions: { orders: 'read', inventory: 'read', ...permissions },
    orderScope: {
      stageIds: ['preparation'],
      locationIds: ['hall'],
      includeUnlocated: false,
    },
  },
})
const own = {
  _id: 'own',
  tenantId: 'tenant',
  title: 'Разрешённый заказ',
  serviceTitle: 'Разрешённая услуга',
  status: 'active',
  workflowStageId: 'preparation',
  locationId: 'hall',
}
const secret = {
  ...own,
  _id: 'secret',
  title: 'Тайный клиентский праздник',
  locationId: 'other',
}

test('explicit catalog, stock, reservations and movement grants remain independent', () => {
  const context = actor({ 'inventory.catalog': 'read' })
  assert.equal(canPartyInventoryAccess(context), true)
  assert.equal(
    canPartyInventoryAccess(context, {
      resource: 'inventory.catalog',
      action: 'edit',
    }),
    false
  )
  for (const resource of [
    'inventory.stock',
    'inventory.reservations',
    'inventory.movements',
  ])
    assert.equal(canPartyInventoryAccess(context, { resource }), false)
  assert.equal(
    canPartyInventoryAccess(
      actor({ inventory: 'hidden', 'inventory.stock': 'edit' }),
      { resource: 'inventory.stock' }
    ),
    false
  )
})

test('location owner defaults and legacy movement operators do not gain catalog or stock access', () => {
  const location = {
    tenantId: 'tenant',
    role: 'location_owner',
    staff: { tenantId: 'tenant', role: 'location_owner', status: 'active' },
  }
  assert.equal(canPartyInventoryAccess(location), false)
  const legacy = {
    tenantId: 'tenant',
    role: 'performer',
    staff: {
      tenantId: 'tenant',
      role: 'performer',
      status: 'active',
      operationalPermissions: ['inventory.movements'],
    },
  }
  assert.equal(
    canPartyInventoryAccess(legacy, {
      resource: 'inventory.movements',
      action: 'edit',
    }),
    true
  )
  assert.equal(canPartyInventoryAccess(legacy), false)
  assert.equal(
    canPartyInventoryAccess(legacy, { resource: 'inventory.stock' }),
    false
  )
  const custom = actor({ 'inventory.movements': 'hidden' })
  custom.staff.operationalPermissions = ['inventory.movements']
  assert.equal(
    canPartyInventoryAccess(custom, { resource: 'inventory.movements' }),
    false
  )
})

test('record scope, tenant, inactive staff and revoked positions are checked for inventory actions', () => {
  const context = actor({ 'inventory.reservations': 'edit' })
  assert.equal(
    canPartyInventoryAccess(context, {
      resource: 'inventory.reservations',
      action: 'edit',
      order: own,
    }),
    true
  )
  for (const order of [
    secret,
    { ...own, tenantId: 'other' },
    { ...own, workflowStageId: 'new' },
  ])
    assert.equal(
      canPartyInventoryAccess(context, {
        resource: 'inventory.reservations',
        action: 'edit',
        order,
      }),
      false
    )
  assert.equal(
    canPartyInventoryAccess(
      { ...context, staff: { ...context.staff, status: 'archived' } },
      { resource: 'inventory.reservations' }
    ),
    false
  )
  assert.equal(
    canPartyInventoryAccess(
      { ...context, position: null },
      { resource: 'inventory.reservations' }
    ),
    false
  )
})

const result = {
  items: [
    {
      _id: 'costume',
      title: 'Костюм',
      unit: 'шт.',
      category: 'Одежда',
      status: 'active',
      quantity: 100,
      unavailableQuantity: 5,
      storageLocation: 'Частный склад',
      unavailableReason: 'Внутренняя причина',
      freeQuantity: 90,
      heldQuantity: 5,
    },
  ],
  hasShortage: true,
  warnings: [
    {
      resourceId: 'costume',
      title: 'Костюм',
      quantity: 100,
      unavailableQuantity: 5,
      needed: 2,
      occupied: 99,
      shortage: 1,
      heldQuantity: 5,
      startAt: '2026-10-27T00:00:00Z',
      endAt: '2026-10-27T01:00:00Z',
      serviceLineIds: ['own-line'],
      conflicts: [
        {
          orderId: 'own',
          orderTitle: 'Разрешённый заказ',
          serviceId: 'service',
          quantity: 2,
        },
        {
          orderId: 'secret',
          orderTitle: secret.title,
          serviceId: 'private-service',
          quantity: 50,
        },
        { orderId: 'secret', orderTitle: secret.title, quantity: 49 },
      ],
      holders: [
        {
          orderId: 'secret',
          holderStaffId: 'secret-holder',
          holderName: 'Неизвестный сотрудник',
          quantity: 8,
        },
      ],
    },
  ],
  holdingRisks: [
    {
      orderId: 'secret',
      holderStaffId: 'secret-holder',
      holderName: 'Неизвестный сотрудник',
      quantity: 8,
    },
  ],
  reservation: {
    orderId: 'own',
    rows: [{ resourceId: 'costume', quantity: 2 }],
  },
}

test('catalog read omits physical stock, holders and exact shortage while keeping the own requested kit', () => {
  const data = filterPartyInventoryData({
    context: actor({
      'inventory.catalog': 'read',
      'inventory.reservations': 'read',
    }),
    data: result,
    orders: [own, secret],
  })
  assert.deepEqual(data.items, [
    {
      _id: 'costume',
      title: 'Костюм',
      category: 'Одежда',
      unit: 'шт.',
      status: 'active',
    },
  ])
  for (const key of [
    'quantity',
    'occupied',
    'unavailableQuantity',
    'shortage',
    'heldQuantity',
  ])
    assert.equal(Object.hasOwn(data.warnings[0], key), false)
  assert.deepEqual(data.warnings[0].holders, [])
  assert.deepEqual(data.holdingRisks, [])
  assert.equal(data.reservation.rows[0].quantity, 2)
  assert.equal(JSON.stringify(data).includes('private-service'), false)
  assert.equal(JSON.stringify(data).includes(secret.title), false)
})

test('warnings for inaccessible orders expose one generic marker, never order, service or holder identities', () => {
  const data = filterPartyInventoryData({
    context: actor({ 'inventory.catalog': 'read', 'inventory.stock': 'read' }),
    data: result,
    orders: [own, secret],
  })
  assert.equal(data.warnings[0].quantity, 100)
  assert.equal(data.warnings[0].conflicts.length, 2)
  assert.deepEqual(data.warnings[0].conflicts[1], {
    unavailableOrder: true,
    orderTitle: 'Занято недоступным заказом',
  })
  const serialized = JSON.stringify(data)
  for (const value of [
    secret.title,
    'private-service',
    'secret-holder',
    'Неизвестный сотрудник',
  ])
    assert.equal(serialized.includes(value), false)
})

test('movement journals, order choices and current holdings are scoped even for stock readers', () => {
  const data = filterPartyInventoryData({
    context: actor({
      'inventory.movements': 'read',
      'inventory.stock': 'read',
      'orders.title': 'read',
    }),
    data: {
      orders: [own, secret],
      movements: [
        { orderId: 'own', quantity: 2 },
        { orderId: 'secret', quantity: 4 },
      ],
      holdings: [
        { orderId: 'secret', holderName: 'Private' },
        { orderId: 'own', quantity: 2 },
      ],
    },
    orders: [own, secret],
    resource: 'inventory.movements',
  })
  assert.equal(data.orders.length, 1)
  assert.equal(data.movements.length, 1)
  assert.equal(data.holdings.length, 1)
  assert.equal(data.movements[0].orderTitle, own.title)
})

test('nested saved reservation warnings are filtered just like availability and conflict responses', () => {
  const context = actor({ 'inventory.catalog': 'read' })
  const data = filterPartyInventoryData({
    context,
    data: { saved: false, reservation: { warnings: result.warnings } },
    orders: [own, secret],
  })
  assert.equal(Object.hasOwn(data.reservation.warnings[0], 'occupied'), false)
  assert.equal(JSON.stringify(data).includes(secret.title), false)
  assert.deepEqual(
    collectPartyInventoryOrderIds({ ...result, orders: [own] }).sort(),
    ['own', 'secret']
  )
})

test('movement readers do not receive the recipient directory; editors receive only names and IDs', () => {
  const staff = [{ _id: 'person', firstName: 'Анна', secondName: 'Иванова', title: 'Артист', status: 'active', phone: 79130000001, privateNote: 'Внутреннее' }]
  for (const level of ['read', 'edit']) {
    const data = filterPartyInventoryData({
      context: actor({ 'inventory.movements': level }),
      resource: 'inventory.movements',
      data: { staff },
    })
    assert.deepEqual(data.staff, level === 'read' ? [] : [{ _id: 'person', firstName: 'Анна', secondName: 'Иванова', title: 'Артист', status: 'active' }])
    assert.equal(JSON.stringify(data).includes('79130000001'), false)
    assert.equal(JSON.stringify(data).includes('Внутреннее'), false)
  }
})
