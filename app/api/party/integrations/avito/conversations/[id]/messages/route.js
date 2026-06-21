import { NextResponse } from 'next/server'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import {
  getPartyAvitoConversationModel,
  getPartyAvitoMessageModel,
} from '@server/partyModels'
import { sendPartyAvitoConversationReply } from '@server/partyMessengerReplies'
import { requestAvitoAccessToken, sendAvitoMessage } from '@server/avito'

const getId = async (params) => String((await params)?.id || '').trim()

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const conversationId = await getId(params)
  const PartyAvitoConversations = await getPartyAvitoConversationModel()
  const conversation = await PartyAvitoConversations.findOne({
    _id: conversationId,
    tenantId: context.tenantId,
  }).lean()
  if (!conversation) {
    return NextResponse.json(
      { success: false, error: 'Переписка не найдена' },
      { status: 404 }
    )
  }

  const PartyAvitoMessages = await getPartyAvitoMessageModel()
  const messages = await PartyAvitoMessages.find({
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
  const PartyAvitoConversations = await getPartyAvitoConversationModel()
  const PartyAvitoMessages = await getPartyAvitoMessageModel()
  const result = await sendPartyAvitoConversationReply({
    models: {
      Conversation: PartyAvitoConversations,
      Message: PartyAvitoMessages,
    },
    tenantId: context.tenantId,
    conversationId,
    text: body?.text,
    integrations: context.company?.settings?.integrations ?? {},
    requestAccessToken: requestAvitoAccessToken,
    sendMessage: sendAvitoMessage,
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
          message: result.error || 'Не удалось отправить сообщение Avito',
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
