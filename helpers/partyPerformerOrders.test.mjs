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
      servicesIds: ['service-1'],
      serviceTitle: 'Анимация',
      clientId: 'client-1',
      responsibleStaffId: 'admin-1',
      client: { name: 'Снапшот', phone: '79990000000' },
      adminComment: 'Взять костюм',
      performerComment: 'Вход через служебный вход',
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
        'company-1:client-1',
        {
          tenantId: 'company-1',
          firstName: 'Иван',
          secondName: 'Клиент',
          phone: '78880000000',
          whatsapp: '78880000001',
          telegram: 'client_handle',
          email: 'client@example.com',
        },
      ],
    ]),
    servicesById: new Map([
      [
        'service-1',
        {
          _id: 'service-1',
          title: 'Бумажное шоу',
        },
      ],
    ]),
    staffById: new Map([
      [
        'company-1:admin-1',
        {
          _id: 'admin-1',
          tenantId: 'company-1',
          firstName: 'Анна',
          secondName: 'Админова',
          phone: '79991112233',
          email: 'admin@example.com',
          role: 'admin',
        },
      ],
    ]),
  })

  assert.equal(result.assignment.payoutAmount, 5000)
  assert.equal(result.client.name, 'Иван Клиент')
  assert.equal(result.client.whatsapp, '78880000001')
  assert.equal(result.client.telegram, 'client_handle')
  assert.equal(result.client.email, 'client@example.com')
  assert.deepEqual(result.serviceTitles, ['Бумажное шоу', 'Анимация'])
  assert.equal(result.performerComment, 'Вход через служебный вход')
  assert.equal(result.responsibleStaff.name, 'Админова Анна')
  assert.equal(result.responsibleStaff.phone, '79991112233')
  assert.equal(result.responsibleStaff.email, 'admin@example.com')
  assert.equal(Object.hasOwn(result, 'contractAmount'), false)
  assert.equal(Object.hasOwn(result, 'clientPayment'), false)
  assert.equal(Object.hasOwn(result, 'transactions'), false)
  assert.equal(Object.hasOwn(result, 'balance'), false)
  assert.equal(Object.hasOwn(result, 'tariffId'), false)
  assert.equal(Object.hasOwn(result, 'adminComment'), false)
  assert.equal(Object.hasOwn(result, 'internalNotes'), false)
})

test('onsite projection exposes only contact details and communication instructions', () => {
  const order = {
    _id: 'order', tenantId: 'company',
    contactRoles: {
      onsiteClientId: 'onsite', partnerClientId: 'partner', payerClientId: 'payer',
      representAs: 'Агентство', communicationNotes: 'Сначала написать',
      allowedContactMethods: ['telegram', 'phone', 'internal'],
    },
  }
  const args = {
    order, membership: { staffId: 'staff', tenantId: 'company' }, locationsById: new Map(),
    clientsById: new Map([['company:onsite', {
      tenantId: 'company', firstName: 'Анна', secondName: 'Иванова',
      phone: '123', email: 'example@example.com', balance: 1234, notes: 'private',
    }]]),
  }
  const result = sanitizePartyOrderForPerformer(args)
  assert.deepEqual(result.onsiteContact, { name: 'Анна Иванова', phone: '123', email: 'example@example.com' })
  assert.deepEqual(result.communicationInstructions, {
    representAs: 'Агентство', communicationNotes: 'Сначала написать', allowedContactMethods: ['telegram', 'phone'],
  })
  assert.equal(Object.hasOwn(result, 'contactRoles'), false)
  assert.equal(JSON.stringify(result).includes('payer'), false)
  for (const contact of [
    { tenantId: 'other', phone: 'secret' },
    { tenantId: 'company', status: 'archived', phone: 'secret' },
  ]) {
    assert.equal(sanitizePartyOrderForPerformer({ ...args, clientsById: new Map([['company:onsite', contact]]) }).onsiteContact, null)
  }
  assert.equal(sanitizePartyOrderForPerformer({ ...args, clientsById: new Map([['other:onsite', { tenantId: 'other' }]]) }).onsiteContact, null)
  const legacy = sanitizePartyOrderForPerformer({ ...args, order: { _id: 'order', tenantId: 'company' } })
  assert.equal(legacy.onsiteContact, null)
  assert.deepEqual(legacy.communicationInstructions, { representAs: '', communicationNotes: '', allowedContactMethods: [] })
})
