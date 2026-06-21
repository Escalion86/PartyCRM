const cleanText = (value, maxLength = 500) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : ''
}

const toDateOrNull = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const requiredText = (value, fallback = '') => cleanText(value, 5000) || fallback

export const saveIncomingPartyAvitoMessage = async ({
  models,
  tenantId,
  clientId = null,
  orderId = null,
  normalized = {},
  rawPayload = null,
}) => {
  const avitoChatId = cleanText(normalized.avitoChatId || normalized.leadExternalId, 160)
  if (!models?.Conversation || !models?.Message || !tenantId || !avitoChatId) {
    return { conversation: null, message: null, skipped: true }
  }

  const text = requiredText(normalized.comment, 'Новое сообщение из Avito')
  const sentAt = toDateOrNull(normalized.sentAt) || new Date()
  const conversation = await models.Conversation.findOneAndUpdate(
    { tenantId, avitoChatId },
    {
      $set: {
        tenantId,
        clientId,
        orderId,
        avitoChatId,
        avitoUserId: cleanText(normalized.avitoUserId, 160),
        avitoItemId: cleanText(normalized.avitoItemId, 160),
        avitoItemTitle: cleanText(normalized.avitoItemTitle || normalized.serviceTitle, 500),
        clientName: cleanText(normalized.clientName, 160),
        lastMessageText: text,
        lastMessageAt: sentAt,
        raw: rawPayload,
      },
      $inc: { unreadCount: 1 },
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const message = await models.Message.create({
    tenantId,
    conversationId: conversation._id,
    clientId,
    orderId,
    avitoChatId,
    avitoMessageId: cleanText(normalized.avitoMessageId, 160),
    direction: 'incoming',
    text,
    sentAt,
    status: 'received',
    raw: rawPayload,
  })

  return { conversation, message, skipped: false }
}

export const saveIncomingPartyVkMessage = async ({
  models,
  tenantId,
  clientId = null,
  orderId = null,
  normalized = {},
  rawPayload = null,
}) => {
  const vkPeerId = cleanText(normalized.vkPeerId || normalized.leadExternalId, 160)
  if (!models?.Conversation || !models?.Message || !tenantId || !vkPeerId) {
    return { conversation: null, message: null, skipped: true }
  }

  const text = requiredText(normalized.comment, 'Сообщение VK без текста')
  const sentAt = toDateOrNull(normalized.sentAt) || new Date()
  const conversation = await models.Conversation.findOneAndUpdate(
    { tenantId, vkPeerId },
    {
      $set: {
        tenantId,
        clientId,
        orderId,
        vkPeerId,
        vkUserId: cleanText(normalized.vkUserId, 160),
        vkGroupId: cleanText(normalized.vkGroupId, 160),
        clientName: cleanText(normalized.clientName, 160),
        lastMessageText: text,
        lastMessageAt: sentAt,
        raw: rawPayload,
      },
      $inc: { unreadCount: 1 },
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const message = await models.Message.create({
    tenantId,
    conversationId: conversation._id,
    clientId,
    orderId,
    vkPeerId,
    vkMessageId: cleanText(normalized.vkMessageId, 160),
    vkUserId: cleanText(normalized.vkUserId, 160),
    direction: 'incoming',
    text,
    attachments: Array.isArray(normalized.attachments) ? normalized.attachments : [],
    sentAt,
    status: 'received',
    raw: rawPayload,
  })

  return { conversation, message, skipped: false }
}
