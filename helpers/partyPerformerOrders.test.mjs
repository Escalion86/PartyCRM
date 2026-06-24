import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizePartyOrderForPerformer } from './partyPerformerOrders.js'

test('sanitizePartyOrderForPerformer hides company finance fields', () => {
  const result = sanitizePartyOrderForPerformer({
    order: {
      _id: 'order-1',
      tenantId: 'company-1',
      title: 'Праздник',
      status: 'active',
      eventDate: '2026-06-20T12:00:00.000Z',
      dateEnd: '2026-06-20T14:00:00.000Z',
      placeType: 'company_location',
      locationId: 'location-1',
      serviceTitle: 'Анимация',
      clientId: 'client-1',
      client: { name: 'Снапшот', phone: '79990000000' },
      adminComment: 'Взять костюм',
      internalNotes: 'Клиент просил скидку, не показывать',
      contractAmount: 30000,
      clientPayment: { totalAmount: 30000, status: 'paid' },
      transactions: [{ amount: 30000, type: 'income' }],
      balance: 1000,
      tariffId: 'tariff-1',
      assignedStaff: [
        {
          staffId: 'staff-1',
          role: 'performer',
          payoutAmount: 5000,
          payoutStatus: 'ready',
          confirmationStatus: 'confirmed',
        },
      ],
    },
    membership: {
      staffId: 'staff-1',
      tenantId: 'company-1',
      role: 'performer',
      company: { title: 'Компания' },
    },
    locationsById: new Map([
      [
        'company-1:location-1',
        {
          _id: 'location-1',
          title: 'Зал',
          address: { town: 'Москва' },
        },
      ],
    ]),
    clientsById: new Map([
      [
        'client-1',
        {
          firstName: 'Иван',
          secondName: 'Клиент',
          phone: '78880000000',
        },
      ],
    ]),
  })

  assert.equal(result.assignment.payoutAmount, 5000)
  assert.equal(result.client.name, 'Иван Клиент')
  assert.equal(Object.hasOwn(result, 'contractAmount'), false)
  assert.equal(Object.hasOwn(result, 'clientPayment'), false)
  assert.equal(Object.hasOwn(result, 'transactions'), false)
  assert.equal(Object.hasOwn(result, 'balance'), false)
  assert.equal(Object.hasOwn(result, 'tariffId'), false)
  assert.equal(Object.hasOwn(result, 'adminComment'), false)
  assert.equal(Object.hasOwn(result, 'internalNotes'), false)
})
