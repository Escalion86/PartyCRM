import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyOrderDraftFromCall,
  createPartyOrderFromCallDraft,
  savePartyNovofonCall,
} from './partyNovofonCalls.js'

const createFakeModels = ({ existingClient = null, existingCall = null } = {}) => {
  const calls = {
    clientFind: [],
    clientCreate: [],
    callFindOneAndUpdate: [],
  }

  return {
    calls,
    Client: {
      findOne: (filter) => {
        calls.clientFind.push(filter)
        return { lean: async () => existingClient }
      },
      create: async (payload) => {
        calls.clientCreate.push(payload)
        return {
          _id: 'client-created',
          toJSON: () => ({ _id: 'client-created', ...payload }),
        }
      },
    },
    Call: {
      findOneAndUpdate: (filter, update, options) => {
        calls.callFindOneAndUpdate.push({ filter, update, options })
        const value = {
          _id: existingCall?._id || 'call-1',
          ...existingCall,
          ...filter,
          ...update.$set,
          ...update.$setOnInsert,
        }
        return {
          lean: async () => ({
            ...value,
            orderDraft: value.orderDraft
              ? {
                  ...value.orderDraft,
                  leadMeta: { ...value.orderDraft.leadMeta },
                }
              : value.orderDraft,
          }),
        }
      },
    },
  }
}

const createFakeOrderModels = ({
  call = null,
  createdOrderId = 'order-created',
} = {}) => {
  const calls = {
    callFindOne: [],
    callUpdateOne: [],
    orderCreate: [],
  }

  return {
    calls,
    Call: {
      findOne: (filter) => {
        calls.callFindOne.push(filter)
        return { lean: async () => call }
      },
      updateOne: async (filter, update) => {
        calls.callUpdateOne.push({ filter, update })
        return { modifiedCount: 1 }
      },
    },
    Order: {
      create: async (payload) => {
        calls.orderCreate.push(payload)
        return { _id: createdOrderId, ...payload }
      },
    },
  }
}

test('savePartyNovofonCall links incoming call to existing Party client by phone', async () => {
  const models = createFakeModels({
    existingClient: {
      _id: 'client-1',
      firstName: 'Анна',
      phone: '79991234567',
    },
  })

  const result = await savePartyNovofonCall({
    models,
    tenantId: 'company-1',
    normalized: {
      provider: 'novofon',
      providerCallId: 'call-123',
      direction: 'incoming',
      phone: '+7 (999) 123-45-67',
      startedAt: new Date('2026-06-21T10:00:00.000Z'),
      durationSec: 35,
      status: 'new',
    },
  })

  assert.equal(result.client._id, 'client-1')
  assert.deepEqual(models.calls.callFindOneAndUpdate[0].filter, {
    tenantId: 'company-1',
    provider: 'novofon',
    providerCallId: 'call-123',
  })
  assert.equal(
    models.calls.callFindOneAndUpdate[0].update.$set.linkedClientId,
    'client-1'
  )
  assert.equal(
    models.calls.callFindOneAndUpdate[0].update.$set.normalizedPhone,
    '79991234567'
  )
})

test('savePartyNovofonCall creates Party client when phone is new', async () => {
  const models = createFakeModels()

  const result = await savePartyNovofonCall({
    models,
    tenantId: 'company-1',
    normalized: {
      provider: 'novofon',
      providerCallId: 'call-456',
      direction: 'incoming',
      phone: '8 923 000-00-00',
      transcript: 'Здравствуйте, меня зовут Мария. Нужен праздник.',
    },
    analyzeTranscript: async () => ({
      summary: 'Клиент просит праздник',
      extractedFields: { clientName: 'Мария Иванова', confidence: 0.8 },
    }),
  })

  assert.equal(result.client._id, 'client-created')
  assert.equal(models.calls.clientCreate[0].firstName, 'Мария')
  assert.equal(models.calls.clientCreate[0].secondName, 'Иванова')
  assert.equal(models.calls.clientCreate[0].phone, '79230000000')
  assert.equal(models.calls.callFindOneAndUpdate[0].update.$set.status, 'ready')
  assert.equal(
    models.calls.callFindOneAndUpdate[0].update.$set.aiSummary,
    'Клиент просит праздник'
  )
})

test('buildPartyOrderDraftFromCall returns confirmable Party order draft without creating order', () => {
  const draft = buildPartyOrderDraftFromCall({
    call: {
      _id: 'call-1',
      startedAt: new Date('2026-06-21T10:00:00.000Z'),
      transcript: 'Хочу день рождения 15 июля, бюджет 30000',
      aiSummary: 'День рождения, бюджет 30000',
      aiExtractedFields: {
        eventType: 'birthday',
        eventDate: new Date('2026-07-15T12:00:00.000Z'),
        eventLocation: 'Красноярск, Весны 1',
        budget: 30000,
        confidence: 0.7,
      },
    },
    client: {
      _id: 'client-1',
      firstName: 'Мария',
      phone: '79230000000',
    },
  })

  assert.equal(draft.status, 'draft')
  assert.equal(draft.clientId, 'client-1')
  assert.equal(draft.leadSource, 'Novofon')
  assert.equal(draft.contractAmount, 30000)
  assert.equal(draft.clientPayment.totalAmount, 30000)
  assert.equal(draft.leadMeta.sourceCallId, 'call-1')
  assert.match(draft.adminComment, /День рождения/)
  assert.match(draft.adminComment, /Transcript/)
})

test('createPartyOrderFromCallDraft creates order and marks call as created', async () => {
  const models = createFakeOrderModels({
    call: {
      _id: 'call-1',
      tenantId: 'company-1',
      linkedClientId: 'client-1',
      linkedOrderId: null,
      orderDraft: {
        status: 'draft',
        title: 'День рождения',
        clientId: 'client-1',
        client: { name: 'Мария', phone: '79230000000', email: '' },
        eventDate: new Date('2026-07-15T12:00:00.000Z'),
        placeType: 'client_address',
        customAddress: 'Красноярск',
        contractAmount: 30000,
        clientPayment: {
          totalAmount: 30000,
          prepaidAmount: 0,
          status: 'wait_prepayment',
        },
        leadSource: 'Novofon',
        leadMeta: { sourceCallId: null, aiConfidence: 0.7 },
      },
    },
  })
  const now = new Date('2026-06-21T11:00:00.000Z')

  const result = await createPartyOrderFromCallDraft({
    models,
    tenantId: 'company-1',
    callId: 'call-1',
    now,
  })

  assert.equal(result.error, null)
  assert.equal(result.order._id, 'order-created')
  assert.equal(models.calls.orderCreate[0].tenantId, 'company-1')
  assert.equal(models.calls.orderCreate[0].leadMeta.sourceCallId, 'call-1')
  assert.equal(models.calls.orderCreate[0].clientId, 'client-1')
  assert.deepEqual(models.calls.callUpdateOne[0], {
    filter: { _id: 'call-1', tenantId: 'company-1' },
    update: {
      $set: {
        linkedOrderId: 'order-created',
        status: 'linked',
        eventDecision: 'created',
        eventDecisionAt: now,
      },
    },
  })
})

test('createPartyOrderFromCallDraft rejects calls that already created an order', async () => {
  const models = createFakeOrderModels({
    call: {
      _id: 'call-1',
      tenantId: 'company-1',
      linkedOrderId: 'order-existing',
      orderDraft: { title: 'Повторный заказ' },
    },
  })

  const result = await createPartyOrderFromCallDraft({
    models,
    tenantId: 'company-1',
    callId: 'call-1',
  })

  assert.equal(result.error.status, 409)
  assert.equal(result.error.code, 'partycrm_call_order_already_created')
  assert.equal(models.calls.orderCreate.length, 0)
  assert.equal(models.calls.callUpdateOne.length, 0)
})
