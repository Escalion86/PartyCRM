import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { loadPartyInboxChannel } from '@server/partyInbox'
import { getPartyClientModel, getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  try {
    const page = Number(new URL(req.url).searchParams.get('page') || 0)
    if (!Number.isInteger(page) || page < 0 || page > 10000) return partyError(400, 'invalid_page', 'Некорректная страница', 'validation')
    const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
    const channels = ['vk', 'avito', ...(tariff.access?.allowTelegramIntegration ? ['telegram'] : []), 'novofon']
    const results = await Promise.all(channels.map((channel) => loadPartyInboxChannel({ tenantId: context.tenantId, channel, page })))
    let options = null
    if (page === 0) {
      const [Clients, Orders, Staff] = await Promise.all([getPartyClientModel(), getPartyOrderModel(), getPartyStaffModel()])
      const [clients, orders, staff] = await Promise.all([
        Clients.find({ tenantId: context.tenantId, status: { $ne: 'archived' } }).select('_id firstName secondName phone').sort({ firstName: 1 }).limit(501).lean(),
        Orders.find({ tenantId: context.tenantId }).select('_id title eventDate clientId').sort({ eventDate: -1 }).limit(501).lean(),
        Staff.find({ tenantId: context.tenantId, status: 'active', role: { $in: ['owner', 'admin'] } }).select('_id firstName secondName role').sort({ firstName: 1 }).lean(),
      ])
      options = { clients: clients.slice(0, 500), orders: orders.slice(0, 500), staff, truncated: clients.length > 500 || orders.length > 500 }
    }
    return NextResponse.json({ success: true, data: {
      items: results.flatMap((result) => result.items).sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt)),
      hasMore: results.some((result) => result.hasMore), page, channels, options,
    } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return partyError(500, 'inbox_load_failed', 'Не удалось загрузить входящие')
  }
}
