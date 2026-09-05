import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import {
  getPartyAvitoConversationModel,
  getPartyTelegramConversationModel,
  getPartyVkConversationModel,
} from '@server/partyModels'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const [Avito, Vk, Telegram, tariff] = await Promise.all([
    getPartyAvitoConversationModel(),
    getPartyVkConversationModel(),
    getPartyTelegramConversationModel(),
    getPartyCompanyTariffAccessState(context.tenantId),
  ])
  const filter = { tenantId: context.tenantId, orderId: { $ne: null } }
  const [avito, vk, telegram] = await Promise.all([
    Avito.find(filter).select({ orderId: 1, unreadCount: 1 }).lean(),
    Vk.find(filter).select({ orderId: 1, unreadCount: 1 }).lean(),
    tariff.access?.allowTelegramIntegration
      ? Telegram.find(filter).select({ orderId: 1, unreadCount: 1 }).lean()
      : [],
  ])
  const byOrderId = {}
  for (const item of [...avito, ...vk, ...telegram]) {
    const orderId = String(item.orderId || '')
    if (!orderId) continue
    byOrderId[orderId] = (byOrderId[orderId] || 0) + Math.max(0, Number(item.unreadCount || 0))
  }
  return NextResponse.json({ success: true, data: { byOrderId } }, { headers: { 'Cache-Control': 'private, no-store' } })
}
