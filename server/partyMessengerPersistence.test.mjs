import test from 'node:test'
import assert from 'node:assert/strict'

import {
  saveIncomingPartyAvitoMessage,
  saveIncomingPartyVkMessage,
} from './partyMessengerPersistence.js'

const createFakeModels = () => {
  const calls = {
    conversation: [],
    message: [],
  }
  return {
    calls,
    Conversation: {
      findOneAndUpdate: async (filter, update, options) => {
        calls.conversation.push({ filter, update, options })
        return {
          _id: 'conversation-1',
          ...filter,
          ...update.$set,
        }
      },
    },
    Message: {
      create: async (payload) => {
        calls.message.push(payload)
        return { _id: 'message-1', ...payload }
      },
    },
  }
}

test('saveIncomingPartyAvitoMessage stores company-scoped conversation and message', async () => {
  const models = createFakeModels()
  const result = await saveIncomingPartyAvitoMessage({
    models,
    tenantId: 'company-1',
    clientId: 'client-1',
    orderId: 'order-1',
    normalized: {
      clientName: 'Анна',
      comment: 'Нужен аниматор',
      avitoChatId: 'chat-1',
      avitoMessageId: 'msg-1',
      avitoUserId: 'user-1',
      avitoItemId: 'item-1',
      avitoItemTitle: 'Аниматор',
    },
    rawPayload: { payload: true },
  })

  assert.equal(result.conversation._id, 'conversation-1')
  assert.deepEqual(models.calls.conversation[0].filter, {
    tenantId: 'company-1',
    avitoChatId: 'chat-1',
  })
  assert.equal(models.calls.conversation[0].update.$set.orderId, 'order-1')
  assert.equal(models.calls.conversation[0].update.$set.clientId, 'client-1')
  assert.equal(models.calls.conversation[0].update.$set.lastMessageText, 'Нужен аниматор')
  assert.equal(models.calls.message[0].conversationId, 'conversation-1')
  assert.equal(models.calls.message[0].orderId, 'order-1')
  assert.equal(models.calls.message[0].direction, 'incoming')
  assert.equal(models.calls.message[0].text, 'Нужен аниматор')
})

test('saveIncomingPartyVkMessage stores company-scoped conversation and message', async () => {
  const models = createFakeModels()
  await saveIncomingPartyVkMessage({
    models,
    tenantId: 'company-1',
    clientId: 'client-1',
    orderId: 'order-1',
    normalized: {
      clientName: 'Клиент VK 123',
      comment: 'Можно забронировать?',
      vkPeerId: '123',
      vkMessageId: 'msg-2',
      vkUserId: '123',
      vkGroupId: 'group-1',
    },
    rawPayload: { type: 'message_new' },
  })

  assert.deepEqual(models.calls.conversation[0].filter, {
    tenantId: 'company-1',
    vkPeerId: '123',
  })
  assert.equal(models.calls.conversation[0].update.$set.orderId, 'order-1')
  assert.equal(models.calls.message[0].vkPeerId, '123')
  assert.equal(models.calls.message[0].vkMessageId, 'msg-2')
  assert.equal(models.calls.message[0].status, 'received')
})
