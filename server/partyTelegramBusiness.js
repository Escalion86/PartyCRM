import crypto from 'crypto'
import dns from 'dns'
import {
  Agent as UndiciAgent,
  ProxyAgent,
  Socks5ProxyAgent,
  fetch as undiciFetch,
} from 'undici'
import {
  getPartyClientModel,
  getPartyCompanyModel,
  getPartyOrderModel,
  getPartyTelegramConversationModel,
  getPartyTelegramMessageModel,
} from './partyModels'
import { registerPartyInboxIncoming, registerPartyInboxOutgoing } from './partyInboxLifecycle'
import {
  getPartyTelegramBusinessMessageDirection,
  isPartyTelegramReplyWindowOpen,
} from '../helpers/partyTelegramBusinessMessage'

const TELEGRAM_API_BASE = 'https://api.telegram.org'
const REQUEST_TIMEOUT_MS = 15_000

const lookupIPv4 = (hostname, options, callback) => {
  if (typeof options === 'function') return dns.lookup(hostname, { family: 4 }, options)
  return dns.lookup(hostname, { ...(options || {}), family: 4 }, callback)
}

const createTransport = () => {
  const proxyUrl = String(process.env.TELEGRAM_PROXY_URL || '').trim()
  if (!proxyUrl) {
    return {
      dispatcher: new UndiciAgent({ connect: { lookup: lookupIPv4, family: 4 } }),
      proxyEnabled: false,
      proxyType: 'direct',
      configError: '',
    }
  }
  try {
    const protocol = new URL(proxyUrl).protocol.toLowerCase()
    if (['http:', 'https:'].includes(protocol)) {
      return { dispatcher: new ProxyAgent(proxyUrl), proxyEnabled: true, proxyType: protocol.slice(0, -1), configError: '' }
    }
    if (['socks5:', 'socks5h:'].includes(protocol)) {
      return { dispatcher: new Socks5ProxyAgent(proxyUrl), proxyEnabled: true, proxyType: protocol.slice(0, -1), configError: '' }
    }
    return { dispatcher: null, proxyEnabled: true, proxyType: 'invalid', configError: 'TELEGRAM_PROXY_URL поддерживает только http://, https:// и socks5://' }
  } catch {
    return { dispatcher: null, proxyEnabled: true, proxyType: 'invalid', configError: 'Некорректный формат TELEGRAM_PROXY_URL' }
  }
}

const transport = createTransport()

const networkCode = (error) => {
  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.code) return String(current.code)
    current = current.cause
  }
  return ''
}

const networkMessage = (error) => {
  const code = networkCode(error)
  if (!transport.proxyEnabled) return code ? `Сервер не может подключиться к Telegram API (${code})` : 'Сервер не может подключиться к Telegram API'
  if (code === 'ECONNREFUSED') return 'Прокси отклонил соединение (ECONNREFUSED). Проверьте TELEGRAM_PROXY_URL и доступность порта из процесса PartyCRM.'
  if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) return `Истекло время подключения к Telegram через прокси (${code})`
  if (code === 'ECONNRESET') return 'Прокси разорвал соединение с Telegram (ECONNRESET)'
  return code ? `Не удалось подключиться к Telegram API через прокси (${code})` : 'Не удалось подключиться к Telegram API через настроенный прокси'
}

const telegramRequest = async ({ botToken, method, body = {} }) => {
  if (transport.configError || !transport.dispatcher) {
    const error = new Error(transport.configError)
    error.code = 'telegram_proxy_invalid'
    throw error
  }
  let response
  try {
    response = await undiciFetch(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      dispatcher: transport.dispatcher,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    const error = new Error(networkMessage(cause))
    error.code = transport.proxyEnabled ? 'telegram_proxy_unavailable' : 'telegram_api_unavailable'
    error.cause = cause
    throw error
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) throw new Error(payload?.description || 'Telegram API error')
  return payload?.result
}

export const getPartyTelegramTransportStatus = () => ({
  proxyEnabled: transport.proxyEnabled,
  proxyType: transport.proxyType,
  configError: transport.configError,
})

export const normalizePartyTelegramSettings = (integrations = {}) => ({
  enabled: integrations.telegramBusinessEnabled === true,
  autoCreateClients: integrations.telegramBusinessAutoCreateClients === true,
  botToken: String(integrations.telegramBusinessBotToken || ''),
  botId: String(integrations.telegramBusinessBotId || ''),
  botUsername: String(integrations.telegramBusinessBotUsername || ''),
  webhookToken: String(integrations.telegramBusinessWebhookToken || ''),
  webhookSecret: String(integrations.telegramBusinessWebhookSecret || ''),
  webhookUrl: String(integrations.telegramBusinessWebhookUrl || ''),
  businessConnectionId: String(integrations.telegramBusinessConnectionId || ''),
  businessAccountUserId: String(integrations.telegramBusinessAccountUserId || ''),
  status: String(integrations.telegramBusinessStatus || 'disabled'),
  lastError: String(integrations.telegramBusinessLastError || ''),
  connectedAt: integrations.telegramBusinessConnectedAt || null,
  lastCheckedAt: integrations.telegramBusinessLastCheckedAt || null,
  lastWebhookAt: integrations.telegramBusinessLastWebhookAt || null,
  lastMessageAt: integrations.telegramBusinessLastMessageAt || null,
  rights: integrations.telegramBusinessRights || null,
})

export const publicPartyTelegramStatus = (settings) => ({
  enabled: settings.enabled,
  autoCreateClients: settings.autoCreateClients,
  hasBotToken: Boolean(settings.botToken),
  botId: settings.botId,
  botUsername: settings.botUsername,
  status: settings.status,
  lastError: settings.lastError,
  connectedAt: settings.connectedAt,
  lastCheckedAt: settings.lastCheckedAt,
  lastWebhookAt: settings.lastWebhookAt,
  lastMessageAt: settings.lastMessageAt,
  rights: settings.rights,
  ...getPartyTelegramTransportStatus(),
})

export const updatePartyTelegramSettings = async ({ companyId, patch }) => {
  const Companies = await getPartyCompanyModel()
  const company = await Companies.findById(companyId).select({ settings: 1 }).lean()
  const settings = company?.settings || {}
  const integrations = settings.integrations || {}
  return Companies.findByIdAndUpdate(
    companyId,
    { $set: { settings: { ...settings, integrations: { ...integrations, ...patch } } } },
    { returnDocument: 'after' }
  ).lean()
}

export const createPartyTelegramWebhookToken = () => `tgb_${crypto.randomBytes(24).toString('hex')}`
export const createPartyTelegramWebhookSecret = () => `tgsec_${crypto.randomBytes(24).toString('hex')}`

export const buildPartyTelegramWebhookUrl = ({ req, token }) => {
  const configured = String(process.env.DOMAIN || '').trim()
  const origin = configured
    ? (configured.startsWith('http') ? configured : `https://${configured}`).replace(/\/$/, '')
    : new URL(req.url).origin
  return `${origin}/api/party/integrations/telegram/webhook/${encodeURIComponent(token)}`
}

export const checkPartyTelegramBot = ({ botToken }) => telegramRequest({ botToken, method: 'getMe' })
export const setPartyTelegramWebhook = ({ botToken, webhookUrl, webhookSecret }) => telegramRequest({
  botToken,
  method: 'setWebhook',
  body: {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ['business_connection', 'business_message', 'edited_business_message', 'deleted_business_messages'],
    drop_pending_updates: false,
  },
})
export const deletePartyTelegramWebhook = ({ botToken }) => telegramRequest({ botToken, method: 'deleteWebhook', body: { drop_pending_updates: false } })
export const sendPartyTelegramBusinessMessage = ({ botToken, businessConnectionId, chatId, text }) => telegramRequest({
  botToken,
  method: 'sendMessage',
  body: { business_connection_id: businessConnectionId, chat_id: chatId, text },
})

const normalizeUsername = (value) => String(value || '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, '').replace(/\/$/, '').toLowerCase()
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const messageText = (message) => {
  const text = String(message?.text || message?.caption || '').trim()
  if (text) return text.slice(0, 4000)
  if (message?.photo) return '[Фото]'
  if (message?.video) return '[Видео]'
  if (message?.voice) return '[Голосовое сообщение]'
  if (message?.audio) return '[Аудио]'
  if (message?.document) return '[Файл]'
  if (message?.sticker) return '[Стикер]'
  if (message?.location) return '[Геопозиция]'
  if (message?.contact) return '[Контакт]'
  return '[Сообщение]'
}

const attachments = (message) => {
  const result = []
  const push = (type, value) => value?.file_id && result.push({ type, fileId: value.file_id, fileName: value.file_name || '', fileSize: value.file_size || 0, mimeType: value.mime_type || '' })
  if (Array.isArray(message?.photo) && message.photo.length) push('photo', message.photo.at(-1))
  push('video', message?.video); push('voice', message?.voice); push('audio', message?.audio); push('document', message?.document); push('sticker', message?.sticker)
  return result
}

const findClient = async ({ tenantId, message, autoCreateClients }) => {
  const Clients = await getPartyClientModel()
  const peer = message?.chat || message?.from || {}
  const telegramUserId = String(peer.id || message?.from?.id || '')
  const username = normalizeUsername(peer.username || message?.from?.username)
  let client = telegramUserId ? await Clients.findOne({ tenantId, telegramUserId }) : null
  if (!client && username) {
    client = await Clients.findOne({ tenantId, telegram: { $regex: `^(?:@|https?://(?:www\\.)?(?:t\\.me|telegram\\.me)/)?${escapeRegExp(username)}/?$`, $options: 'i' } })
  }
  let created = false
  if (!client && autoCreateClients) {
    client = await Clients.create({
      tenantId,
      firstName: String(peer.first_name || message?.from?.first_name || 'Клиент').slice(0, 120),
      secondName: String(peer.last_name || message?.from?.last_name || '').slice(0, 120),
      telegram: username,
      telegramUserId,
      leadSource: 'Telegram',
    })
    created = true
  } else if (client) {
    if (telegramUserId && !client.telegramUserId) client.telegramUserId = telegramUserId
    if (username && !client.telegram) client.telegram = username
    if (client.isModified()) await client.save()
  }
  return { client, created }
}

export const savePartyTelegramBusinessMessage = async ({ tenantId, settings, message }) => {
  const chatId = String(message?.chat?.id || '')
  const messageId = String(message?.message_id || '')
  const connectionId = String(message?.business_connection_id || '')
  if (!chatId || !messageId || !connectionId) return null

  const Conversations = await getPartyTelegramConversationModel()
  const Messages = await getPartyTelegramMessageModel()
  const direction = getPartyTelegramBusinessMessageDirection({ message, businessAccountUserId: settings.businessAccountUserId })
  const { client, created: clientCreated } = await findClient({ tenantId, message, autoCreateClients: settings.autoCreateClients })
  const existingConversation = await Conversations.findOne({ tenantId, telegramChatId: chatId }).lean()
  let orderId = existingConversation?.orderId || null
  if (!orderId && client?._id) {
    const Orders = await getPartyOrderModel()
    const order = await Orders.findOne({ tenantId, clientId: client._id }).sort({ eventDate: -1, createdAt: -1 }).select({ _id: 1 }).lean()
    orderId = order?._id || null
  }
  const sentAt = message?.date ? new Date(Number(message.date) * 1000) : new Date()
  const text = messageText(message)
  const existingMessage = await Messages.exists({ tenantId, telegramChatId: chatId, telegramMessageId: messageId })
  const peer = message?.chat || message?.from || {}
  const conversation = await Conversations.findOneAndUpdate(
    { tenantId, telegramChatId: chatId },
    {
      $set: {
        clientId: client?._id || null,
        orderId,
        businessConnectionId: connectionId,
        telegramUserId: String(peer.id || ''),
        telegramUsername: normalizeUsername(peer.username),
        clientName: [peer.first_name, peer.last_name].filter(Boolean).join(' ').slice(0, 200),
        lastMessageText: text,
        lastMessageAt: sentAt,
        ...(direction === 'incoming' ? { lastIncomingAt: sentAt } : {}),
      },
      ...(direction === 'incoming' && !existingMessage ? { $inc: { unreadCount: 1 } } : {}),
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  )
  const savedMessage = await Messages.findOneAndUpdate(
    { tenantId, telegramChatId: chatId, telegramMessageId: messageId },
    { $set: { conversationId: conversation._id, clientId: client?._id || null, orderId, businessConnectionId: connectionId, direction, text, attachments: attachments(message), sentAt, status: direction === 'incoming' ? 'received' : 'sent' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  )
  if (direction === 'incoming') await registerPartyInboxIncoming({ tenantId, channel: 'telegram', sourceId: conversation._id, token: savedMessage._id, at: sentAt, text, attachments: attachments(message) })
  else await registerPartyInboxOutgoing({ tenantId, channel: 'telegram', sourceId: conversation._id, token: savedMessage._id, at: sentAt, text, attachments: attachments(message) })
  return { conversation, message: savedMessage, client, clientCreated, direction }
}

export { isPartyTelegramReplyWindowOpen }
