import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import AvitoMessages from '@models/AvitoMessages'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'messenger_candidates_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'messenger', message } },
    { status }
  )

const normalizeConversation = (provider, conversation) => ({
  _id: String(conversation._id),
  provider,
  providerLabel: provider === 'avito' ? 'Avito' : 'VK',
  clientId: conversation.clientId ? String(conversation.clientId) : '',
  linkedToCurrentClient: Boolean(conversation.clientId),
  title:
    provider === 'avito'
      ? conversation.avitoItemTitle || conversation.clientName || 'Чат Avito'
      : conversation.clientName || 'Чат VK',
  subtitle:
    conversation.lastMessageText ||
    (provider === 'avito' ? conversation.avitoChatId : conversation.vkPeerId) ||
    '',
  externalId:
    provider === 'avito' ? conversation.avitoChatId : conversation.vkPeerId,
  lastMessageText: conversation.lastMessageText || '',
  lastMessageAt: conversation.lastMessageAt || null,
  unreadCount: conversation.unreadCount || 0,
})

const loadCandidates = async ({ tenantId, clientId }) => {
  const query = {
    tenantId,
    $or: [{ clientId: null }, { clientId: { $exists: false } }, { clientId }],
  }

  const [avitoConversations, vkConversations] = await Promise.all([
    AvitoConversations.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(100)
      .lean(),
    VkConversations.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(100)
      .lean(),
  ])

  return [
    ...avitoConversations.map((item) => normalizeConversation('avito', item)),
    ...vkConversations.map((item) => normalizeConversation('vk', item)),
  ].sort(
    (a, b) =>
      new Date(b.lastMessageAt || 0).getTime() -
      new Date(a.lastMessageAt || 0).getTime()
  )
}

export const GET = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const clientId = String(routeParams?.id || '').trim()
  if (!isObjectId(clientId)) return jsonError('Некорректный ID клиента', 400, 'bad_id')

  await dbConnect()
  const conversations = await loadCandidates({ tenantId, clientId })

  return NextResponse.json(
    { success: true, data: { conversations } },
    { status: 200 }
  )
}

export const PATCH = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const clientId = String(routeParams?.id || '').trim()
  if (!isObjectId(clientId)) return jsonError('Некорректный ID клиента', 400, 'bad_id')

  const body = await req.json().catch(() => ({}))
  const provider = String(body?.provider || '').trim().toLowerCase()
  const conversationId = String(body?.conversationId || '').trim()
  const linked = body?.linked === true

  if (!['avito', 'vk'].includes(provider)) {
    return jsonError('Некорректный источник переписки', 400, 'bad_provider')
  }
  if (!isObjectId(conversationId)) {
    return jsonError('Некорректный ID переписки', 400, 'bad_conversation_id')
  }

  await dbConnect()

  const ConversationModel =
    provider === 'avito' ? AvitoConversations : VkConversations
  const MessageModel = provider === 'avito' ? AvitoMessages : VkMessages

  const current = await ConversationModel.findOne({
    _id: conversationId,
    tenantId,
  }).lean()
  if (!current) return jsonError('Переписка не найдена', 404, 'not_found')

  const currentClientId = current.clientId ? String(current.clientId) : ''
  if (currentClientId && currentClientId !== clientId) {
    return jsonError(
      'Переписка уже привязана к другому клиенту',
      409,
      'linked_to_other_client'
    )
  }

  const nextClientId = linked ? clientId : null
  await Promise.all([
    ConversationModel.updateOne(
      { _id: conversationId, tenantId },
      { $set: { clientId: nextClientId } }
    ),
    MessageModel.updateMany(
      { tenantId, conversationId },
      { $set: { clientId: nextClientId } }
    ),
  ])

  const conversations = await loadCandidates({ tenantId, clientId })

  return NextResponse.json(
    { success: true, data: { conversations } },
    { status: 200 }
  )
}
