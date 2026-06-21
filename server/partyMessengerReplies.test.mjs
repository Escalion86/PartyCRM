import test from 'node:test'
import assert from 'node:assert/strict'

import {
  sendPartyAvitoConversationReply,
  sendPartyVkConversationReply,
} from './partyMessengerReplies.js'

const createFakeReplyModels = (conversation) => {
  const calls = {
    findOne: [],
    updateOne: [],
    message: [],
  }
  const storedConversation = { ...conversation }

  return {
    calls,
    Conversation: {
      findOne: (filter) => {
        calls.findOne.push(filter)
        return {
          lean: async () =>
            filter.tenantId === storedConversation.tenantId &&
            filter._id === storedConversation._id
              ? { ...storedConversation }
              : null,
        }
      },
      updateOne: async (filter, update) => {
        calls.updateOne.push({ filter, update })
        Object.assign(storedConversation, update.$set || {})
        return { modifiedCount: 1 }
      },
    },
    Message: {
      create: async (payload) => {
        calls.message.push(payload)
        return { _id: `message-${calls.message.length}`, ...payload }
      },
    },
  }
}

test('sendPartyVkConversationReply sends through VK credentials and stores outgoing message', async () => {
  const models = createFakeReplyModels({
    _id: 'conversation-1',
    tenantId: 'company-1',
    clientId: 'client-1',
    orderId: 'order-1',
    vkPeerId: '2000000001',
    vkUserId: '123',
  })
  const providerCalls = []

  const result = await sendPartyVkConversationReply({
    models,
    tenantId: 'company-1',
    conversationId: 'conversation-1',
    text: 'Здравствуйте, свободно на 15:00',
    integrations: {
      vkGroupEnabled: true,
      vkGroupAccessToken: 'vk-token',
    },
    sendMessage: async (payload) => {
      providerCalls.push(payload)
      return { ok: true, payload: { response: 42 } }
    },
  })

  assert.equal(result.ok, true)
  assert.deepEqual(providerCalls[0], {
    accessToken: 'vk-token',
    peerId: '2000000001',
    text: 'Здравствуйте, свободно на 15:00',
  })
  assert.equal(models.calls.message[0].direction, 'outgoing')
  assert.equal(models.calls.message[0].status, 'sent')
  assert.equal(models.calls.message[0].clientId, 'client-1')
  assert.equal(models.calls.message[0].orderId, 'order-1')
  assert.equal(models.calls.updateOne[0].update.$set.lastMessageText, 'Здравствуйте, свободно на 15:00')
})

test('sendPartyAvitoConversationReply requests access token, sends and stores outgoing message', async () => {
  const models = createFakeReplyModels({
    _id: 'conversation-2',
    tenantId: 'company-1',
    clientId: 'client-2',
    orderId: 'order-2',
    avitoChatId: 'chat-123',
  })
  const tokenCalls = []
  const providerCalls = []

  const result = await sendPartyAvitoConversationReply({
    models,
    tenantId: 'company-1',
    conversationId: 'conversation-2',
    text: 'Да, можем провести праздник',
    integrations: {
      avitoEnabled: true,
      avitoClientId: 'client-id',
      avitoClientSecret: 'client-secret',
      avitoUserId: 'user-1',
    },
    requestAccessToken: async (payload) => {
      tokenCalls.push(payload)
      return { access_token: 'avito-access-token' }
    },
    sendMessage: async (payload) => {
      providerCalls.push(payload)
      return { ok: true, payload: { id: 'avito-message-1' } }
    },
  })

  assert.equal(result.ok, true)
  assert.deepEqual(tokenCalls[0], {
    clientId: 'client-id',
    clientSecret: 'client-secret',
  })
  assert.deepEqual(providerCalls[0], {
    accessToken: 'avito-access-token',
    userId: 'user-1',
    chatId: 'chat-123',
    text: 'Да, можем провести праздник',
  })
  assert.equal(models.calls.message[0].avitoChatId, 'chat-123')
  assert.equal(models.calls.message[0].direction, 'outgoing')
  assert.equal(models.calls.message[0].status, 'sent')
})

test('sendPartyVkConversationReply stores failed outgoing message when provider rejects reply', async () => {
  const models = createFakeReplyModels({
    _id: 'conversation-3',
    tenantId: 'company-1',
    clientId: 'client-3',
    orderId: 'order-3',
    vkPeerId: '123',
  })

  const result = await sendPartyVkConversationReply({
    models,
    tenantId: 'company-1',
    conversationId: 'conversation-3',
    text: 'Проверка ошибки',
    integrations: {
      vkGroupEnabled: true,
      vkGroupAccessToken: 'vk-token',
    },
    sendMessage: async () => ({
      ok: false,
      error: 'message_send_failed_403',
      payload: { error_code: 403 },
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'message_send_failed_403')
  assert.equal(models.calls.message[0].status, 'failed')
  assert.equal(models.calls.message[0].raw.error, 'message_send_failed_403')
}
)
