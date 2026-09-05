import { NextResponse } from 'next/server'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import {
  getPartyVkConversationModel,
  getPartyVkMessageModel,
} from '@server/partyModels'
import { sendPartyVkConversationReply } from '@server/partyMessengerReplies'
import { registerPartyInboxOutgoing } from '@server/partyInboxLifecycle'
import { sendVkMessage } from '@server/vkGroup'

const getId = async (params) => String((await params)?.id || '').trim()

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const conversationId = await getId(params)
  const PartyVkConversations = await getPartyVkConversationModel()
  const conversation = await PartyVkConversations.findOneAndUpdate(
    { _id: conversationId, tenantId: context.tenantId },
    { $set: { unreadCount: 0 } },
    { returnDocument: 'after' }
  ).lean()
  if (!conversation) {
    return NextResponse.json(
      { success: false, error: 'Переписка не найдена' },
      { status: 404 }
    )
  }

  const PartyVkMessages = await getPartyVkMessageModel()
  const messages = await PartyVkMessages.find({
    tenantId: context.tenantId,
    conversationId,
  })
    .sort({ sentAt: 1, createdAt: 1 })
    .limit(200)
    .lean()

  return NextResponse.json({
    success: true,
    data: { conversation, messages },
  })
}

export async function POST(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const conversationId = await getId(params)
  const PartyVkConversations = await getPartyVkConversationModel()
  const PartyVkMessages = await getPartyVkMessageModel()
  const result = await sendPartyVkConversationReply({
    models: {
      Conversation: PartyVkConversations,
      Message: PartyVkMessages,
    },
    tenantId: context.tenantId,
    conversationId,
    text: body?.text,
    integrations: context.company?.settings?.integrations ?? {},
    sendMessage: sendVkMessage,
    registerInboxOutgoing: registerPartyInboxOutgoing,
    actorStaffId: context.staff?._id || null,
  })

  if (!result.ok) {
    const status =
      result.error === 'conversation_not_found'
        ? 404
        : result.error === 'message_text_required'
          ? 400
          : 502

    return NextResponse.json(
      {
        success: false,
        error: {
          message: result.error || 'Не удалось отправить сообщение VK',
        },
        data: { message: result.message ?? null },
      },
      { status }
    )
  }

  return NextResponse.json({
    success: true,
    data: { message: result.message },
  })
}
