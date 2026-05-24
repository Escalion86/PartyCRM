import crypto from 'crypto'
import SiteSettings from '@models/SiteSettings'
import Events from '@models/Events'
import AvitoConversations from '@models/AvitoConversations'
import AvitoMessages from '@models/AvitoMessages'
import {
  createPublicLeadDraftEvent,
  normalizePhone,
  normalizeText,
  readCustomValue,
  upsertPublicLeadClient,
} from '@server/publicLeadService'
import {
  getPublicLeadPushState,
  logPublicLeadPushDiagnostic,
  logPublicLeadPushError,
  logPublicLeadPushSkipped,
  notifyApiLeadCreated,
} from '@server/publicLeadPush'

const AVITO_API_BASE_URL = 'https://api.avito.ru'

const getFirstString = (...values) => {
  const value = values.find(
    (item) => item !== undefined && item !== null && String(item).trim()
  )
  return value === undefined || value === null ? '' : String(value).trim()
}

const toObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const createWebhookToken = () =>
  `avito_${crypto.randomUUID().replace(/-/g, '')}`

const normalizeAvitoSettings = (custom) => ({
  enabled: readCustomValue(custom, 'avitoEnabled') === true,
  clientId: normalizeText(readCustomValue(custom, 'avitoClientId'), 256),
  clientSecret: normalizeText(readCustomValue(custom, 'avitoClientSecret'), 512),
  userId: normalizeText(readCustomValue(custom, 'avitoUserId'), 120),
  webhookToken: normalizeText(readCustomValue(custom, 'avitoWebhookToken'), 160),
  webhookUrl: normalizeText(readCustomValue(custom, 'avitoWebhookUrl'), 1000),
  webhookId: normalizeText(readCustomValue(custom, 'avitoWebhookId'), 160),
  status: normalizeText(readCustomValue(custom, 'avitoStatus'), 80),
  lastError: normalizeText(readCustomValue(custom, 'avitoLastError'), 1000),
  connectedAt: normalizeText(readCustomValue(custom, 'avitoConnectedAt'), 80),
  lastCheckedAt: normalizeText(readCustomValue(custom, 'avitoLastCheckedAt'), 80),
  lastWebhookAt: normalizeText(readCustomValue(custom, 'avitoLastWebhookAt'), 80),
  lastChatId: normalizeText(readCustomValue(custom, 'avitoLastChatId'), 160),
})

const buildPublicBaseUrl = (req) => {
  const envDomain = normalizeText(process.env.DOMAIN, 300)
  if (envDomain) {
    return envDomain.startsWith('http') ? envDomain : `https://${envDomain}`
  }

  const origin = normalizeText(req?.headers?.get?.('origin'), 300)
  if (origin) return origin

  const host = normalizeText(req?.headers?.get?.('host'), 300)
  if (!host) return ''
  const proto = normalizeText(req?.headers?.get?.('x-forwarded-proto'), 20)
  return `${proto || 'https'}://${host}`
}

const buildAvitoWebhookUrl = ({ req, token }) => {
  const baseUrl = buildPublicBaseUrl(req).replace(/\/+$/, '')
  if (!baseUrl || !token) return ''
  return `${baseUrl}/api/integrations/avito/webhook/${token}`
}

const requestAvitoAccessToken = async ({ clientId, clientSecret }) => {
  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)

  const response = await fetch(`${AVITO_API_BASE_URL}/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || !payload?.access_token) {
    const message =
      payload?.error_description ||
      payload?.error ||
      `Avito token request failed: ${response.status}`
    throw new Error(message)
  }

  return payload
}

const registerAvitoWebhook = async ({ accessToken, webhookUrl }) => {
  if (!accessToken || !webhookUrl) return { ok: false, error: 'empty_webhook' }

  const response = await fetch(`${AVITO_API_BASE_URL}/messenger/v3/webhook`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: webhookUrl }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        payload?.error_description ||
        payload?.error ||
        payload?.message ||
        `webhook_register_failed_${response.status}`,
      payload,
    }
  }

  return {
    ok: true,
    webhookId: normalizeText(payload?.id || payload?.webhook_id, 160),
    payload,
  }
}

const sendAvitoMessage = async ({ accessToken, userId, chatId, text }) => {
  if (!accessToken || !userId || !chatId || !text) {
    return { ok: false, error: 'missing_send_params' }
  }

  const response = await fetch(
    `${AVITO_API_BASE_URL}/messenger/v1/accounts/${encodeURIComponent(
      userId
    )}/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        message: {
          text,
        },
        type: 'text',
      }),
    }
  )
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        payload?.error_description ||
        payload?.error ||
        payload?.message ||
        `message_send_failed_${response.status}`,
      payload,
    }
  }

  return { ok: true, payload }
}

const findDeepValue = (source, keys) => {
  const stack = [source]
  const lowerKeys = keys.map((key) => String(key).toLowerCase())
  while (stack.length > 0) {
    const item = stack.shift()
    if (!item || typeof item !== 'object') continue
    for (const [key, value] of Object.entries(item)) {
      if (
        lowerKeys.includes(String(key).toLowerCase()) &&
        value !== undefined &&
        value !== null &&
        String(value).trim()
      ) {
        return value
      }
      if (value && typeof value === 'object') stack.push(value)
    }
  }
  return ''
}

const normalizeAvitoWebhookPayload = (body = {}) => {
  const payload = toObject(body?.payload) || {}
  const value = toObject(payload?.value || body?.value)
  const message = toObject(value?.message || payload?.message || body?.message)
  const chat = toObject(value?.chat || payload?.chat || body?.chat)
  const author = toObject(
    value?.author || value?.user || payload?.author || body?.author
  )
  const item = toObject(value?.item || payload?.item || body?.item)

  const text = normalizeText(
    getFirstString(
      message?.text,
      value?.text,
      payload?.text,
      body?.text,
      findDeepValue(body, ['message_text', 'messageText'])
    ),
    5000
  )
  const chatId = normalizeText(
    getFirstString(
      chat?.id,
      value?.chat_id,
      payload?.chat_id,
      body?.chat_id,
      findDeepValue(body, ['chatId', 'chat_id'])
    ),
    160
  )
  const messageId = normalizeText(
    getFirstString(
      message?.id,
      value?.message_id,
      payload?.message_id,
      body?.message_id,
      findDeepValue(body, ['messageId', 'message_id'])
    ),
    160
  )
  const userId = normalizeText(
    getFirstString(
      author?.id,
      value?.user_id,
      payload?.user_id,
      body?.user_id,
      findDeepValue(body, ['userId', 'user_id', 'author_id'])
    ),
    160
  )
  const itemId = normalizeText(
    getFirstString(
      item?.id,
      value?.item_id,
      payload?.item_id,
      body?.item_id,
      findDeepValue(body, ['itemId', 'item_id'])
    ),
    160
  )
  const itemTitle = normalizeText(
    getFirstString(
      item?.title,
      value?.item_title,
      payload?.item_title,
      body?.item_title,
      findDeepValue(body, ['itemTitle', 'item_title', 'title'])
    ),
    500
  )
  const authorName = normalizeText(
    getFirstString(
      author?.name,
      author?.username,
      value?.user_name,
      payload?.user_name,
      body?.user_name,
      findDeepValue(body, ['userName', 'user_name', 'author_name'])
    ),
    120
  )
  const phone = normalizePhone(
    getFirstString(
      value?.phone,
      payload?.phone,
      body?.phone,
      findDeepValue(body, ['phone', 'client_phone'])
    )
  )

  return {
    source: 'avito',
    sourceLabel: 'Avito',
    name: authorName || 'Клиент Avito',
    phone,
    comment: text || 'Новое сообщение из Avito',
    avitoChatId: chatId,
    avitoMessageId: messageId,
    avitoUserId: userId,
    avitoItemId: itemId,
    avitoItemTitle: itemTitle,
  }
}

const findClientForAvitoConversation = async ({ tenantId, normalized }) => {
  if (normalized.avitoUserId) {
    const conversation = await AvitoConversations.findOne({
      tenantId,
      avitoUserId: normalized.avitoUserId,
      clientId: { $ne: null },
    })
      .sort({ lastMessageAt: -1 })
      .lean()
    if (conversation?.clientId) return conversation.clientId
  }

  if (normalized.phone) {
    const client = await upsertPublicLeadClient({
      tenantId,
      name: normalized.name,
      phone: normalized.phone,
      whatsapp: '',
      telegram: '',
    })
    return client?._id ?? null
  }

  return null
}

const upsertAvitoConversation = async ({
  tenantId,
  normalized,
  rawPayload,
  clientId,
  eventId,
}) => {
  if (!normalized.avitoChatId) return null

  const now = new Date()
  const existing = await AvitoConversations.findOne({
    tenantId,
    avitoChatId: normalized.avitoChatId,
  })

  const update = {
    tenantId,
    clientId: clientId ?? existing?.clientId ?? null,
    eventId: eventId ?? existing?.eventId ?? null,
    avitoChatId: normalized.avitoChatId,
    avitoUserId: normalized.avitoUserId || existing?.avitoUserId || '',
    avitoItemId: normalized.avitoItemId || existing?.avitoItemId || '',
    avitoItemTitle: normalized.avitoItemTitle || existing?.avitoItemTitle || '',
    clientName: normalized.name || existing?.clientName || '',
    lastMessageText: normalized.comment || existing?.lastMessageText || '',
    lastMessageAt: now,
    raw: rawPayload,
  }

  const conversation = await AvitoConversations.findOneAndUpdate(
    { tenantId, avitoChatId: normalized.avitoChatId },
    existing
      ? { $set: update, $inc: { unreadCount: 1 } }
      : { $set: update, $setOnInsert: { status: 'open', unreadCount: 1 } },
    { upsert: true, returnDocument: 'after' }
  )

  return conversation
}

const saveIncomingAvitoMessage = async ({
  tenantId,
  conversation,
  normalized,
  rawPayload,
}) => {
  if (!conversation?._id || !normalized.avitoChatId) return null
  const sentAt = new Date()

  if (normalized.avitoMessageId) {
    const existing = await AvitoMessages.findOne({
      tenantId,
      avitoChatId: normalized.avitoChatId,
      avitoMessageId: normalized.avitoMessageId,
    }).lean()
    if (existing) return existing
  }

  return AvitoMessages.create({
    tenantId,
    conversationId: conversation._id,
    clientId: conversation.clientId ?? null,
    eventId: conversation.eventId ?? null,
    avitoChatId: normalized.avitoChatId,
    avitoMessageId: normalized.avitoMessageId,
    direction: 'incoming',
    text: normalized.comment,
    sentAt,
    status: 'received',
    raw: rawPayload,
  })
}

const appendMessageToExistingEvent = async ({ event, normalized, rawPayload }) => {
  const clientData = toObject(event.clientData)
  const lead = toObject(clientData.lead)
  const messages = Array.isArray(lead.messages) ? lead.messages.slice(-49) : []
  const nextMessage = {
    id: normalized.avitoMessageId,
    text: normalized.comment,
    receivedAt: new Date().toISOString(),
    raw: rawPayload,
  }

  const duplicateMessage =
    nextMessage.id && messages.some((item) => item?.id === nextMessage.id)
  const nextLead = {
    ...lead,
    ...normalized,
    raw: rawPayload,
    lastMessageAt: new Date().toISOString(),
    messages: duplicateMessage ? messages : [...messages, nextMessage],
  }

  event.clientData = {
    ...clientData,
    source: 'Avito',
    sourceLabel: 'Avito',
    createdViaApi: true,
    lead: nextLead,
  }

  if (
    normalized.comment &&
    !String(event.description || '').includes(normalized.comment)
  ) {
    event.description = `${event.description || ''}\n\nAvito: ${normalized.comment}`.trim()
  }

  await event.save()
  return event
}

const notifyAvitoLead = async ({ tenantId, event, normalized, siteSettings }) => {
  const configuredPushEnabled =
    readCustomValue(siteSettings?.custom, 'publicLeadPushEnabled') === true
  const pushState = await getPublicLeadPushState({
    tenantId,
    configured: configuredPushEnabled,
  })

  await logPublicLeadPushDiagnostic({
    tenantId,
    event,
    stage: 'resolved',
    message: 'Диагностика push по Avito-заявке: состояние перед отправкой',
    meta: {
      configured: pushState.configured,
      activeSubscriptions: pushState.activeSubscriptions,
      enabled: pushState.enabled,
      skippedReason: pushState.skippedReason,
      fallbackUsed: pushState.fallbackUsed,
      endpoint: 'avito_webhook',
    },
  })

  if (!pushState.enabled) {
    await logPublicLeadPushSkipped({
      tenantId,
      event,
      reason: pushState.skippedReason,
      configured: configuredPushEnabled,
      activeSubscriptions: pushState.activeSubscriptions,
      fallbackUsed: pushState.fallbackUsed,
    })
    return { enabled: false, skippedReason: pushState.skippedReason }
  }

  try {
    return await notifyApiLeadCreated({
      tenantId,
      event,
      normalizedData: {
        phone: normalized.phone,
        source: 'Avito',
      },
    })
  } catch (error) {
    await logPublicLeadPushError({ tenantId, event, error })
    return { enabled: true, sent: 0, failed: 1, skippedReason: 'notify_error' }
  }
}

const createOrUpdateAvitoLead = async ({ tenantId, siteSettings, body }) => {
  const normalized = normalizeAvitoWebhookPayload(body)
  if (!normalized.avitoChatId && !normalized.comment) {
    return { ok: false, status: 400, error: 'empty_avito_message' }
  }

  const linkedClientId = await findClientForAvitoConversation({
    tenantId,
    normalized,
  })

  const existingEvent = normalized.avitoChatId
    ? await Events.findOne({
        tenantId,
        'clientData.lead.source': 'avito',
        'clientData.lead.avitoChatId': normalized.avitoChatId,
      })
    : null

  if (existingEvent) {
    const conversation = await upsertAvitoConversation({
      tenantId,
      normalized,
      rawPayload: body,
      clientId: existingEvent.clientId ?? linkedClientId,
      eventId: existingEvent._id,
    })
    await saveIncomingAvitoMessage({
      tenantId,
      conversation,
      normalized,
      rawPayload: body,
    })
    const event = await appendMessageToExistingEvent({
      event: existingEvent,
      normalized,
      rawPayload: body,
    })
    return { ok: true, event, created: false, normalized }
  }

  const event = await createPublicLeadDraftEvent({
    tenantId,
    clientId: linkedClientId,
    normalizedData: {
      ...normalized,
      source: 'avito',
      sourceLabel: 'Avito',
      raw: undefined,
    },
    rawPayload: body,
    historyUserId: 'avito-webhook',
    apiKeyData: {
      id: 'avito',
      name: 'Avito',
    },
  })

  const conversation = await upsertAvitoConversation({
    tenantId,
    normalized,
    rawPayload: body,
    clientId: linkedClientId,
    eventId: event._id,
  })
  await saveIncomingAvitoMessage({
    tenantId,
    conversation,
    normalized,
    rawPayload: body,
  })
  await notifyAvitoLead({ tenantId, event, normalized, siteSettings })

  return {
    ok: true,
    event,
    clientId: linkedClientId,
    conversation,
    created: true,
    normalized,
  }
}

const updateAvitoCustom = async ({ tenantId, patch }) => {
  const current = await SiteSettings.findOne({ tenantId }).lean()
  const custom = current?.custom ?? {}
  const nextCustom = {
    ...(typeof custom?.get === 'function' ? Object.fromEntries(custom) : custom),
    ...patch,
  }

  return SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, custom: nextCustom } },
    { upsert: true, returnDocument: 'after' }
  ).lean()
}

export {
  buildAvitoWebhookUrl,
  createOrUpdateAvitoLead,
  createWebhookToken,
  normalizeAvitoSettings,
  registerAvitoWebhook,
  requestAvitoAccessToken,
  sendAvitoMessage,
  updateAvitoCustom,
}
