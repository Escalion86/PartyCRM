import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import { getPartyVkConversationModel } from '@server/partyModels'

const cleanText = (value, maxLength = 120) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : ''
}

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const url = new URL(req.url)
  const clientId = cleanText(url.searchParams.get('clientId'))
  const orderId = cleanText(url.searchParams.get('orderId') || url.searchParams.get('eventId'))
  const filter = { tenantId: context.tenantId }
  if (clientId) filter.clientId = clientId
  if (orderId) filter.orderId = orderId

  const PartyVkConversations = await getPartyVkConversationModel()
  const conversations = await PartyVkConversations.find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(50)
    .lean()

  return NextResponse.json({ success: true, data: conversations })
}
