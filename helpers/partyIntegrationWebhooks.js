const cleanText = (value, maxLength = 500) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : ''
}

const toObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const getFirstString = (...values) => {
  const value = values.find(
    (item) => item !== undefined && item !== null && String(item).trim()
  )
  return value === undefined || value === null ? '' : String(value).trim()
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

const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '')

const normalizeOrigin = (value) => cleanText(value, 300).replace(/\/+$/, '')

const getRequestHeader = (req, key) => {
  const headers = req?.headers
  if (!headers) return ''
  if (typeof headers.get === 'function') return cleanText(headers.get(key), 300)
  return cleanText(headers[key], 300)
}

const buildPublicBaseUrl = ({ origin = '', req = null } = {}) => {
  const explicitOrigin = normalizeOrigin(origin)
  if (explicitOrigin) return explicitOrigin

  const envDomain = normalizeOrigin(
    typeof process !== 'undefined' ? process.env?.DOMAIN : ''
  )
  if (envDomain) {
    return envDomain.startsWith('http') ? envDomain : `https://${envDomain}`
  }

  const requestOrigin = normalizeOrigin(getRequestHeader(req, 'origin'))
  if (requestOrigin) return requestOrigin

  const host = cleanText(getRequestHeader(req, 'host'), 300)
  if (!host) return ''
  const proto = cleanText(getRequestHeader(req, 'x-forwarded-proto'), 20)
  return `${proto || 'https'}://${host}`
}

export const buildPartyIntegrationWebhookUrl = ({
  provider,
  token,
  origin = '',
  req = null,
} = {}) => {
  const normalizedProvider = cleanText(provider, 40).toLowerCase()
  const normalizedToken = cleanText(token, 200)
  const baseUrl = buildPublicBaseUrl({ origin, req })
  if (!baseUrl || !normalizedProvider || !normalizedToken) return ''
  return `${baseUrl}/api/party/integrations/${normalizedProvider}/webhook/${normalizedToken}`
}

export const buildPartyAvitoWebhookUrl = ({ token, origin = '', req = null } = {}) =>
  buildPartyIntegrationWebhookUrl({ provider: 'avito', token, origin, req })

export const buildPartyVkWebhookUrl = ({ token, origin = '', req = null } = {}) =>
  buildPartyIntegrationWebhookUrl({ provider: 'vk', token, origin, req })

export const buildPartyNovofonWebhookUrl = ({
  token,
  origin = '',
  req = null,
} = {}) =>
  buildPartyIntegrationWebhookUrl({ provider: 'novofon', token, origin, req })

export const normalizePartyAvitoWebhookLead = (body = {}) => {
  const payload = toObject(body?.payload)
  const value = toObject(payload?.value || body?.value)
  const message = toObject(value?.message || payload?.message || body?.message)
  const chat = toObject(value?.chat || payload?.chat || body?.chat)
  const author = toObject(
    value?.author || value?.user || payload?.author || body?.author
  )
  const item = toObject(value?.item || payload?.item || body?.item)

  const text = cleanText(
    getFirstString(
      message?.text,
      value?.text,
      payload?.text,
      body?.text,
      findDeepValue(body, ['message_text', 'messageText'])
    ),
    2000
  )
  const chatId = cleanText(
    getFirstString(
      chat?.id,
      value?.chat_id,
      payload?.chat_id,
      body?.chat_id,
      findDeepValue(body, ['chatId', 'chat_id'])
    ),
    160
  )
  const messageId = cleanText(
    getFirstString(
      message?.id,
      value?.message_id,
      payload?.message_id,
      body?.message_id,
      findDeepValue(body, ['messageId', 'message_id'])
    ),
    160
  )
  const userId = cleanText(
    getFirstString(
      author?.id,
      value?.user_id,
      payload?.user_id,
      body?.user_id,
      findDeepValue(body, ['userId', 'user_id', 'author_id'])
    ),
    160
  )
  const itemId = cleanText(
    getFirstString(
      item?.id,
      value?.item_id,
      payload?.item_id,
      body?.item_id,
      findDeepValue(body, ['itemId', 'item_id'])
    ),
    160
  )
  const itemTitle = cleanText(
    getFirstString(
      item?.title,
      value?.item_title,
      payload?.item_title,
      body?.item_title,
      findDeepValue(body, ['itemTitle', 'item_title', 'title'])
    ),
    180
  )
  const authorName = cleanText(
    getFirstString(
      author?.name,
      author?.username,
      value?.user_name,
      payload?.user_name,
      body?.user_name,
      findDeepValue(body, ['userName', 'user_name', 'author_name'])
    ),
    160
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
    clientName: authorName || 'Клиент Avito',
    phone,
    comment: text || 'Новое сообщение из Avito',
    source: 'Avito',
    serviceTitle: itemTitle,
    leadExternalId: chatId,
    avitoChatId: chatId,
    avitoMessageId: messageId,
    avitoUserId: userId,
    avitoItemId: itemId,
    avitoItemTitle: itemTitle,
  }
}

export const normalizePartyVkWebhookLead = (body = {}) => {
  const object = toObject(body?.object)
  const message = toObject(object?.message || body?.message)
  const text = cleanText(getFirstString(message?.text, body?.text), 2000)
  const userId = cleanText(getFirstString(message?.from_id, body?.from_id), 160)
  const messageId = cleanText(
    getFirstString(
      message?.id,
      message?.conversation_message_id,
      body?.message_id
    ),
    160
  )
  const peerId = cleanText(
    getFirstString(message?.peer_id, message?.from_id, body?.peer_id),
    160
  )
  const groupId = cleanText(getFirstString(body?.group_id, object?.group_id), 160)
  const sentAt =
    Number(message?.date) > 0 ? new Date(Number(message.date) * 1000) : null

  return {
    clientName: userId ? `Клиент VK ${userId}` : 'Клиент VK',
    phone: '',
    comment: text || 'Сообщение VK без текста',
    source: 'VK',
    serviceTitle: '',
    leadExternalId: peerId,
    vkPeerId: peerId,
    vkMessageId: messageId,
    vkUserId: userId,
    vkGroupId: groupId,
    sentAt,
  }
}

export const isPartyVkWebhookSecretValid = ({ expectedSecret, body } = {}) => {
  const expected = cleanText(expectedSecret, 200)
  if (!expected) return true
  return cleanText(body?.secret, 200) === expected
}
