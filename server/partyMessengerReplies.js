import { getVkGroupReplyCredentials } from './partyVkGroups.js'

const cleanText = (value, maxLength = 4000) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : ''
}

const makeError = (error, payload = null) => ({
  ok: false,
  error: cleanText(error, 500) || 'message_send_failed',
  payload,
})

const normalizeSendResult = (result) => {
  if (result?.ok) return { ok: true, payload: result.payload ?? null }
  return makeError(result?.error || 'message_send_failed', result?.payload ?? null)
}

const createOutgoingMessage = async ({
  models,
  conversation,
  tenantId,
  text,
  status,
  raw,
  provider,
  registerInboxOutgoing,
  actorStaffId,
}) => {
  const sentAt = new Date()
  const providerFields =
    provider === 'avito'
      ? { avitoChatId: conversation.avitoChatId }
      : {
          vkPeerId: conversation.vkPeerId,
          vkUserId: conversation.vkUserId || '',
          vkGroupId: conversation.vkGroupId || '',
        }

  const message = await models.Message.create({
    tenantId,
    conversationId: conversation._id,
    clientId: conversation.clientId || null,
    orderId: conversation.orderId || null,
    ...providerFields,
    direction: 'outgoing',
    text,
    sentAt,
    status,
    raw,
  })

  await models.Conversation.updateOne(
    { _id: conversation._id, tenantId },
    {
      $set: {
        lastMessageText: text,
        lastMessageAt: sentAt,
      },
    }
  )
  if (status === 'sent') await registerInboxOutgoing({ tenantId, channel: provider, sourceId: conversation._id, token: message._id, at: sentAt, text, actorStaffId })

  return message
}

const findConversation = async ({ models, tenantId, conversationId }) => {
  if (!models?.Conversation || !tenantId || !conversationId) return null
  return models.Conversation.findOne({ _id: conversationId, tenantId }).lean()
}

export const sendPartyVkConversationReply = async ({
  models,
  tenantId,
  conversationId,
  text,
  integrations = {},
  sendMessage,
  registerInboxOutgoing = async () => {},
  actorStaffId = null,
}) => {
  const cleanMessageText = cleanText(text)
  if (!cleanMessageText) return makeError('message_text_required')

  const conversation = await findConversation({ models, tenantId, conversationId })
  if (!conversation?.vkPeerId) return makeError('conversation_not_found')
  const credentials = getVkGroupReplyCredentials({ integrations, conversation })
  if (!credentials.ok) return makeError(credentials.error)

  let sendResult
  try {
    sendResult = normalizeSendResult(
      await sendMessage({
        accessToken: credentials.accessToken,
        peerId: conversation.vkPeerId,
        text: cleanMessageText,
      })
    )
  } catch (error) {
    sendResult = makeError(error?.message || error)
  }

  const message = await createOutgoingMessage({
    models,
    conversation,
    tenantId,
    text: cleanMessageText,
    status: sendResult.ok ? 'sent' : 'failed',
    raw: sendResult.ok
      ? { provider: 'vk', payload: sendResult.payload }
      : { provider: 'vk', error: sendResult.error, payload: sendResult.payload },
    provider: 'vk',
    registerInboxOutgoing,
    actorStaffId,
  })

  return {
    ok: sendResult.ok,
    error: sendResult.ok ? '' : sendResult.error,
    message,
  }
}

export const sendPartyAvitoConversationReply = async ({
  models,
  tenantId,
  conversationId,
  text,
  integrations = {},
  requestAccessToken,
  sendMessage,
  registerInboxOutgoing = async () => {},
  actorStaffId = null,
}) => {
  const cleanMessageText = cleanText(text)
  if (!cleanMessageText) return makeError('message_text_required')
  if (
    !integrations.avitoEnabled ||
    !integrations.avitoClientId ||
    !integrations.avitoClientSecret ||
    !integrations.avitoUserId
  ) {
    return makeError('avito_integration_not_connected')
  }

  const conversation = await findConversation({ models, tenantId, conversationId })
  if (!conversation?.avitoChatId) return makeError('conversation_not_found')

  let sendResult
  try {
    const tokenResponse = await requestAccessToken({
      clientId: integrations.avitoClientId,
      clientSecret: integrations.avitoClientSecret,
    })
    sendResult = normalizeSendResult(
      await sendMessage({
        accessToken: tokenResponse?.access_token,
        userId: integrations.avitoUserId,
        chatId: conversation.avitoChatId,
        text: cleanMessageText,
      })
    )
  } catch (error) {
    sendResult = makeError(error?.message || error)
  }

  const message = await createOutgoingMessage({
    models,
    conversation,
    tenantId,
    text: cleanMessageText,
    status: sendResult.ok ? 'sent' : 'failed',
    raw: sendResult.ok
      ? { provider: 'avito', payload: sendResult.payload }
      : { provider: 'avito', error: sendResult.error, payload: sendResult.payload },
    provider: 'avito',
    registerInboxOutgoing,
    actorStaffId,
  })

  return {
    ok: sendResult.ok,
    error: sendResult.ok ? '' : sendResult.error,
    message,
  }
}
