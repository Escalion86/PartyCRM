import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartyOrderContacts,
  getPartyOrderPerformerContactIds,
  removePartyOrderContact,
  setPartyOrderContactComment,
  setPartyOrderContactSetting,
} from './partyOrderContacts.js'
import { sanitizePartyOrderForPerformer } from './partyPerformerOrders.js'

const main = '507f1f77bcf86cd799439011'
const other = '507f1f77bcf86cd799439012'
const payer = '507f1f77bcf86cd799439013'
const tenantId = '507f1f77bcf86cd799439014'

test('unified contact list deduplicates people and preserves every distinct legacy label', () => {
  const contacts = buildPartyOrderContacts({
    clientId: main,
    otherContacts: [
      { clientId: main, comment: 'Мама' },
      { clientId: other, comment: 'На месте' },
      { clientId: other, comment: 'Бабушка' },
    ],
    contactRoles: {
      partnerClientId: other,
      payerClientId: other,
      onsiteClientId: other,
    },
  })
  assert.equal(contacts.length, 2)
  assert.deepEqual(contacts[0].comments, ['Мама'])
  assert.deepEqual(contacts[1].comments, ['На месте', 'Бабушка'])
  assert.deepEqual(contacts[1].systemRoles, [
    'partnerClientId',
    'payerClientId',
    'onsiteClientId',
  ])
  assert.equal(contacts[1].performerCanContact, true)
})

test('arbitrary labels never create payer/partner roles and role-only contacts stay private by default', () => {
  const contacts = buildPartyOrderContacts({
    clientId: main,
    otherContacts: [{ clientId: other, comment: 'Плательщик' }],
    contactRoles: { payerClientId: payer },
  })
  assert.deepEqual(
    contacts.find((item) => item.clientId === other).systemRoles,
    []
  )
  assert.deepEqual(
    getPartyOrderPerformerContactIds({
      clientId: main,
      contactRoles: { payerClientId: payer },
    }),
    [main]
  )
})

test('explicit contact settings restrict primary/onsite and enable an additional contact independently', () => {
  const order = {
    clientId: main,
    otherContacts: [{ clientId: other }],
    contactRoles: {
      onsiteClientId: main,
      contactSettings: [
        {
          clientId: main,
          performerCanContact: false,
          allowedContactMethods: ['phone'],
        },
        {
          clientId: other,
          performerCanContact: true,
          allowedContactMethods: ['telegram'],
        },
      ],
    },
  }
  assert.deepEqual(getPartyOrderPerformerContactIds(order), [other])
  assert.deepEqual(buildPartyOrderContacts(order)[1].allowedContactMethods, [
    'telegram',
  ])
})

test('merged duplicate settings use the stricter visibility until the next save', () => {
  const order = {
    clientId: main,
    contactRoles: {
      contactSettings: [
        {
          clientId: main,
          performerCanContact: false,
          allowedContactMethods: ['phone'],
        },
        {
          clientId: main,
          performerCanContact: true,
          allowedContactMethods: ['telegram'],
        },
      ],
    },
  }
  assert.equal(buildPartyOrderContacts(order)[0].performerCanContact, false)
  const changed = setPartyOrderContactSetting(order.contactRoles, main, {
    performerCanContact: true,
  })
  assert.equal(changed.contactSettings.length, 1)
})

test('comment changes and explicit contact removal preserve unrelated financial links', () => {
  const items = [
    { clientId: other, comment: 'Старое' },
    { clientId: main, comment: 'Мама' },
  ]
  assert.deepEqual(setPartyOrderContactComment(items, other, 'Новое'), [
    { clientId: other, comment: 'Новое' },
    items[1],
  ])
  const removed = removePartyOrderContact({
    clientId: other,
    otherContacts: items,
    contactRoles: {
      payerClientId: payer,
      partnerClientId: other,
      communicationNotes: 'Не терять',
    },
  })
  assert.equal(removed.contactRoles.payerClientId, payer)
  assert.equal(removed.contactRoles.partnerClientId, null)
  assert.equal(removed.contactRoles.communicationNotes, 'Не терять')
})

const performerArgs = (order = {}) => ({
  order: {
    _id: 'order',
    tenantId,
    clientId: main,
    client: {
      name: 'Снимок мамы',
      phone: '79130000001',
      email: 'snapshot@example.com',
    },
    otherContacts: [{ clientId: other, comment: 'Бабушка' }],
    ...order,
  },
  membership: { staffId: 'staff', tenantId },
  locationsById: new Map(),
  clientsById: new Map([
    [
      tenantId + ':' + main,
      {
        _id: main,
        tenantId,
        firstName: 'Мама',
        phone: '79130000001',
        whatsapp: '79130000001',
      },
    ],
    [
      tenantId + ':' + other,
      {
        _id: other,
        tenantId,
        firstName: 'Бабушка',
        phone: '79130000002',
        telegram: 'grandmother',
        email: 'grandmother@example.com',
        internalNotes: 'private-secret',
      },
    ],
  ]),
})

test('performer projection hides forbidden primary snapshot and all its messaging channels', () => {
  const result = sanitizePartyOrderForPerformer(
    performerArgs({
      contactRoles: {
        onsiteClientId: main,
        contactSettings: [
          { clientId: main, performerCanContact: false },
          {
            clientId: other,
            performerCanContact: true,
            allowedContactMethods: ['telegram'],
          },
        ],
      },
    })
  )
  assert.equal(result.client.phone, '')
  assert.equal(result.client.name, '')
  assert.equal(result.client.whatsapp, '')
  assert.equal(result.onsiteContact, null)
  assert.equal(result.performerContacts.length, 1)
  assert.equal(result.performerContacts[0].name, 'Бабушка')
  assert.equal(JSON.stringify(result).includes('79130000001'), false)
  assert.equal(JSON.stringify(result).includes('private-secret'), false)
})

test('position access is an upper bound even when the order checkbox allows a contact', () => {
  const args = performerArgs({
    contactRoles: {
      contactSettings: [{ clientId: other, performerCanContact: true }],
    },
  })
  const hidden = sanitizePartyOrderForPerformer({
    ...args,
    canViewContacts: false,
  })
  assert.deepEqual(hidden.performerContacts, [])
  assert.equal(hidden.client.phone, '')
  const namesOnly = sanitizePartyOrderForPerformer({
    ...args,
    contactFieldAccess: { phone: false, email: false },
  })
  assert.equal(namesOnly.client.name, 'Мама')
  assert.equal(namesOnly.client.phone, '')
  assert.equal(namesOnly.client.whatsapp, '')
  assert.equal(namesOnly.performerContacts[1].phone, '')
  assert.equal(namesOnly.performerContacts[1].telegram, '')
  assert.equal(namesOnly.performerContacts[1].email, '')
})

test('foreign or archived contacts never fall back to a private saved snapshot', () => {
  const args = performerArgs()
  for (const client of [
    { _id: main, tenantId: 'foreign', phone: 'secret' },
    { _id: main, tenantId, status: 'archived', phone: 'secret' },
  ]) {
    const result = sanitizePartyOrderForPerformer({
      ...args,
      clientsById: new Map([[tenantId + ':' + main, client]]),
    })
    assert.equal(result.client.phone, '')
    assert.equal(result.client.name, '')
    assert.deepEqual(result.performerContacts, [])
  }
})
