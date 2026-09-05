import { NextResponse } from 'next/server'
import { getPartyTelegramRequestContext } from '@server/partyTelegramAccess'
import { getPartyTelegramConversationModel } from '@server/partyModels'
import { isPartyTelegramReplyWindowOpen } from '@server/partyTelegramBusiness'

const clean = (value) => String(value || '').trim().slice(0, 120)

export async function GET(req) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const url = new URL(req.url)
  const clientId = clean(url.searchParams.get('clientId'))
  const orderId = clean(url.searchParams.get('orderId') || url.searchParams.get('eventId'))
  const filter = { tenantId: context.tenantId }
  if (clientId) filter.clientId = clientId
  if (orderId) filter.orderId = orderId
  const Conversations = await getPartyTelegramConversationModel()
  const conversations = await Conversations.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(50).lean()
  return NextResponse.json({ success: true, data: conversations.map((item) => ({ ...item, canReply: isPartyTelegramReplyWindowOpen(item.lastIncomingAt), replyWindowClosesAt: item.lastIncomingAt ? new Date(new Date(item.lastIncomingAt).getTime() + 24 * 60 * 60 * 1000) : null })) })
}
