import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePartyBooking,
  isPartyServiceAvailable,
  partyMoneyKopecks,
  validatePartyServiceQuantity,
  validatePartyRentalContainsProgram,
} from './partyOrderBooking.js'
import {
  normalizePartyPaymentExpectation,
  serializePartyPaymentExpectation,
} from './partyPaymentExpectations.js'
import { getOrderPaymentState } from './partyOrderTransactions.js'
import { getPartyBriefMissingFields } from './partyBriefTemplates.js'
import {
  filterPartyOrderForAccess,
  guardPartyOrderPatch,
} from './partyRolePermissions.js'

const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  typeId = 'c'.repeat(24),
  locationId = 'd'.repeat(24)
const rental = {
  startsAt: '2026-11-04T03:00:00.000Z',
  endsAt: '2026-11-04T05:30:00.000Z',
}
test('repeats sum duration, price and included minutes before rounding payable rent to hours', () => {
  const result = calculatePartyBooking({
    items: [
      {
        unitPrice: 100.1,
        durationMinutes: 45,
        includedRentalMinutes: 20,
        quantity: 2,
      },
      { unitPrice: 200, durationMinutes: 30, quantity: 1 },
    ],
    rental,
    hourlyRate: 1000,
    discount: { type: 'percent', value: 5 },
  })
  assert.equal(result.durationMinutes, 120)
  assert.equal(result.includedRentalMinutes, 40)
  assert.equal(result.payableMinutes, 110)
  assert.equal(result.billedHours, 2)
  assert.equal(result.servicesKopecks, 40020)
  assert.equal(result.totalKopecks, 228019)
})
test('fully included rent is free and offsite orders never charge a room', () => {
  const items = [
    {
      unitPrice: 50,
      durationMinutes: 30,
      includedRentalMinutes: 200,
      quantity: 1,
    },
  ]
  assert.equal(
    calculatePartyBooking({ items, rental, hourlyRate: 500 }).rentalKopecks,
    0
  )
  const offsite = calculatePartyBooking({
    items,
    rental,
    hourlyRate: 500,
    placeType: 'client_address',
  })
  assert.equal(offsite.rentalMinutes, 0)
  assert.equal(offsite.rentalKopecks, 0)
  assert.equal(offsite.includedRentalMinutes, 0)
})
test('rounding changes the billed hours, never the actual interval or program', () => {
  const result = calculatePartyBooking({
    rental,
    hourlyRate: 1200,
    items: [
      {
        unitPrice: 0,
        durationMinutes: 60,
        includedRentalMinutes: 60,
        quantity: 1,
      },
    ],
  })
  assert.equal(result.rentalMinutes, 150)
  assert.equal(result.payableMinutes, 90)
  assert.equal(result.billedHours, 2)
  assert.deepEqual(rental, {
    startsAt: '2026-11-04T03:00:00.000Z',
    endsAt: '2026-11-04T05:30:00.000Z',
  })
})
test('existing fractional quantities and negotiated line discounts remain meaningful snapshots', () => {
  const result = calculatePartyBooking({
    items: [
      { unitPrice: 100, quantity: 1.5, durationMinutes: 30, discount: 5 },
    ],
  })
  assert.equal(result.servicesKopecks, 14500)
  assert.equal(result.durationMinutes, 45)
})
test('new repeats enforce positive integer quantities and optional maximum', () => {
  assert.equal(
    validatePartyServiceQuantity(
      { title: 'Шоу', repeatable: true, maxQuantity: null },
      1000
    ),
    1000
  )
  for (const value of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() =>
      validatePartyServiceQuantity({ repeatable: true }, value)
    )
  assert.throws(() => validatePartyServiceQuantity({ title: 'Шоу' }, 2))
  assert.throws(() =>
    validatePartyServiceQuantity(
      { title: 'Шоу', repeatable: true, maxQuantity: 2 },
      3
    )
  )
})
test('service availability intersects type and room or explicit offsite permission', () => {
  const service = {
    availabilityConfigured: true,
    orderTypeIds: [typeId],
    locationIds: [locationId],
    offsiteAllowed: false,
  }
  assert.equal(
    isPartyServiceAvailable(service, {
      orderTypeId: typeId,
      locationId,
      placeType: 'company_location',
    }),
    true
  )
  assert.equal(
    isPartyServiceAvailable(service, {
      orderTypeId: tenantId,
      locationId,
      placeType: 'company_location',
    }),
    false
  )
  assert.equal(
    isPartyServiceAvailable(service, {
      orderTypeId: typeId,
      locationId: staffId,
      placeType: 'company_location',
    }),
    false
  )
  assert.equal(
    isPartyServiceAvailable(service, {
      orderTypeId: typeId,
      placeType: 'client_address',
    }),
    false
  )
  assert.equal(
    isPartyServiceAvailable(
      { ...service, offsiteAllowed: true },
      { orderTypeId: typeId, placeType: 'client_address' }
    ),
    true
  )
  assert.equal(isPartyServiceAvailable({ title: 'Прежняя услуга' }, {}), true)
  assert.equal(isPartyServiceAvailable({ status: 'archived' }, {}), false)
})
test('invalid money, excess discounts and reversed or too short rental are rejected', () => {
  for (const value of [-1, '1.001', NaN, Infinity, {}, true, ''])
    assert.throws(() => partyMoneyKopecks(value))
  assert.equal(partyMoneyKopecks('1,25'), 125)
  assert.throws(() =>
    calculatePartyBooking({
      items: [{ unitPrice: 1, quantity: 1 }],
      discount: { type: 'amount', value: 2 },
    })
  )
  assert.throws(() =>
    calculatePartyBooking({
      rental: { startsAt: rental.endsAt, endsAt: rental.startsAt },
    })
  )
  assert.throws(() =>
    calculatePartyBooking({
      rental: { startsAt: rental.startsAt, endsAt: '2026-11-04T03:00:30.000Z' },
    })
  )
})
test('rental contains a program with a separate start; boundaries are permitted', () => {
  const program = {
    rental,
    eventDate: '2026-11-04T03:30:00Z',
    dateEnd: '2026-11-04T05:30:00Z',
  }
  assert.doesNotThrow(() => validatePartyRentalContainsProgram(program))
  assert.throws(() =>
    validatePartyRentalContainsProgram({
      ...program,
      dateEnd: '2026-11-04T05:31:00Z',
    })
  )
  assert.throws(() =>
    validatePartyRentalContainsProgram({
      ...program,
      eventDate: '2026-11-04T02:59:00Z',
    })
  )
})
test('a manager note is never required, while zero and false are valid answers', () => {
  const template = {
    fields: [
      { id: 'note', label: 'Памятка', type: 'note', required: true },
      { id: 'number', label: 'Число', type: 'number', required: true },
      { id: 'flag', label: 'Флаг', type: 'checkbox', required: true },
    ],
  }
  assert.deepEqual(
    getPartyBriefMissingFields(
      { customAnswers: { number: 0, flag: false } },
      template
    ),
    []
  )
})
test('pending, partial and canceled expectations never enter actual order revenue', () => {
  const value = normalizePartyPaymentExpectation({
    type: 'income',
    category: 'deposit',
    amount: '500.01',
    paymentMethod: 'transfer',
    dueAt: '2026-11-04T12:00:00Z',
  })
  const dto = serializePartyPaymentExpectation(
    {
      ...value,
      _id: typeId,
      orderId: locationId,
      paidKopecks: 20000,
      revision: 1,
      status: 'pending',
      fulfillments: [],
    },
    new Date('2026-11-05T00:00:00Z')
  )
  assert.equal(dto.remaining, 300.01)
  assert.equal(dto.overdue, true)
  assert.equal(
    getOrderPaymentState({ contractAmount: 1000, transactions: [] }).balanceDue,
    1000
  )
  assert.equal(
    getOrderPaymentState({
      contractAmount: 1000,
      transactions: [{ type: 'income', amount: 200, category: 'deposit' }],
    }).balanceDue,
    800
  )
  assert.equal(
    serializePartyPaymentExpectation(
      {
        ...value,
        _id: typeId,
        orderId: locationId,
        paidKopecks: 20000,
        revision: 2,
        status: 'canceled',
      },
      new Date('2026-11-05')
    ).overdue,
    false
  )
  assert.throws(() =>
    normalizePartyPaymentExpectation({
      type: 'income',
      category: 'deposit',
      amount: 10,
      paymentMethod: 'cash',
      dueAt: '2026-02-30T12:00:00Z',
    })
  )
})
test('new order fields inherit existing field permissions and do not expose prices through service selections', () => {
  const context = {
    tenantId,
    role: 'performer',
    staff: { _id: staffId, tenantId, role: 'performer', status: 'active' },
    position: {
      permissions: {
        orders: 'read',
        'orders.servicesIds': 'read',
        'orders.eventDate': 'edit',
      },
      orderScope: {},
    },
  }
  const order = {
    _id: locationId,
    tenantId,
    bookingVersion: 1,
    title: 'Скрытый тип',
    orderTypeId: typeId,
    orderTypeSnapshot: 'Скрытый тип',
    rental,
    pricingSnapshot: { totalKopecks: 123456 },
    orderItems: [
      {
        serviceId: typeId,
        title: 'Шоу',
        quantity: 2,
        unitPrice: 100,
        durationMinutes: 30,
      },
    ],
  }
  const safe = filterPartyOrderForAccess(context, order)
  assert.equal(safe.orderTypeId, undefined)
  assert.equal(safe.pricingSnapshot, undefined)
  assert.equal(safe.rental, undefined)
  assert.equal(safe.orderItems, undefined)
  assert.equal(safe.serviceSelections[0].quantity, 2)
  assert.equal(safe.serviceSelections[0].unitPrice, undefined)
  assert.equal(guardPartyOrderPatch(context, { rental }, order).ok, false)
})

test('brief contact snapshots and their history retain contact field privacy', () => {
  const context = {
    tenantId,
    role: 'performer',
    staff: { _id: staffId, tenantId, role: 'performer', status: 'active' },
    position: {
      permissions: {
        orders: 'read',
        'orders.eventBrief': 'read',
        'orders.client.email': 'read',
      },
      orderScope: {},
    },
  }
  const contact = {
    clientId: typeId,
    name: 'Скрытое имя',
    phone: '79990000000',
    email: 'visible@example.test',
  }
  const safe = filterPartyOrderForAccess(context, {
    _id: locationId,
    tenantId,
    eventBrief: {
      customAnswers: { contact },
      archivedAnswers: [{ value: contact }],
    },
  })
  assert.deepEqual(safe.eventBrief.customAnswers.contact, {
    clientId: typeId,
    email: 'visible@example.test',
  })
  assert.deepEqual(
    safe.eventBrief.archivedAnswers[0].value,
    safe.eventBrief.customAnswers.contact
  )
  assert.equal(contact.phone, '79990000000')
})
