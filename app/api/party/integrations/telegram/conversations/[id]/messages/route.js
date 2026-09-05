import { NextResponse } from 'next/server'
import { parseJsonBody } from '@server/partyApi'
import { getPartyTelegramRequestContext } from '@server/partyTelegramAccess'
import { getPartyTelegramConversationModel, getPartyTelegramMessageModel } from '@server/partyModels'
import { registerPartyInboxOutgoing } from '@server/partyInboxLifecycle'
import {
  isPartyTelegramReplyWindowOpen,
  normalizePartyTelegramSettings,
  sendPartyTelegramBusinessMessage,
} from '@server/partyTelegramBusiness'

const getId = async (params) => String((await params)?.id || '').trim()

export async function GET(req, { params }) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const conversationId = await getId(params)
  const Conversations = await getPartyTelegramConversationModel()
  const conversation = await Conversations.findOneAndUpdate(
    { _id: conversationId, tenantId: context.tenantId },
    { $set: { unreadCount: 0 } },
    { returnDocument: 'after' }
  ).lean()
  if (!conversation) return NextResponse.json({ success: false, error: 'Переписка не найдена' }, { status: 404 })
  const Messages = await getPartyTelegramMessageModel()
  const messages = await Messages.find({ tenantId: context.tenantId, conversationId }).sort({ sentAt: 1, createdAt: 1 }).limit(500).lean()
  return NextResponse.json({ success: true, data: { conversation: { ...conversation, canReply: isPartyTelegramReplyWindowOpen(conversation.lastIncomingAt) }, messages } })
}

export async function POST(req, { params }) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const conversationId = await getId(params)
  const body = await parseJsonBody(req)
  const text = String(body?.text || '').trim().slice(0, 4000)
  if (!text) return NextResponse.json({ success: false, error: { message: 'Введите сообщение' } }, { status: 400 })
  const Conversations = await getPartyTelegramConversationModel()
  const conversation = await Conversations.findOne({ _id: conversationId, tenantId: context.tenantId }).lean()
  if (!conversation) return NextResponse.json({ success: false, error: { message: 'Переписка не найдена' } }, { status: 404 })
  if (!isPartyTelegramReplyWindowOpen(conversation.lastIncomingAt)) return NextResponse.json({ success: false, error: { message: '24-часовое окно ответа Telegram истекло' } }, { status: 409 })
  const settings = normalizePartyTelegramSettings(context.company?.settings?.integrations)
  if (!settings.enabled || !settings.botToken || !conversation.businessConnectionId) return NextResponse.json({ success: false, error: { message: 'Telegram Business не подключён' } }, { status: 409 })
  try {
    const sent = await sendPartyTelegramBusinessMessage({ botToken: settings.botToken, businessConnectionId: conversation.businessConnectionId, chatId: conversation.telegramChatId, text })
    const Messages = await getPartyTelegramMessageModel()
    const sentAt = sent?.date ? new Date(Number(sent.date) * 1000) : new Date()
    const message = await Messages.findOneAndUpdate(
      { tenantId: context.tenantId, telegramChatId: conversation.telegramChatId, telegramMessageId: String(sent?.message_id || `local-${Date.now()}`) },
      { $set: { conversationId: conversation._id, clientId: conversation.clientId || null, orderId: conversation.orderId || null, businessConnectionId: conversation.businessConnectionId, direction: 'outgoing', text, sentAt, status: 'sent' } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    await Conversations.updateOne({ _id: conversation._id, tenantId: context.tenantId }, { $set: { lastMessageText: text, lastMessageAt: sentAt } })
    await registerPartyInboxOutgoing({ tenantId: context.tenantId, channel: 'telegram', sourceId: conversation._id, token: message._id, at: sentAt, text, actorStaffId: context.staff?._id || null })
    return NextResponse.json({ success: true, data: { message } })
  } catch (sendError) {
    return NextResponse.json({ success: false, error: { message: sendError?.message || 'Не удалось отправить сообщение Telegram' } }, { status: 502 })
  }
}
