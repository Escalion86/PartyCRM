import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { loadPartyInboxChannel, loadPartyInboxOverdue } from '@server/partyInbox'
import { getPartyClientModel, getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import { PARTY_INBOX_CHANNELS, PARTY_INBOX_SALES_STAGES, PARTY_INBOX_STATUSES } from '@helpers/partyInboxCore'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  try {
    const params = new URL(req.url).searchParams
    const page = Number(params.get('page') || 0)
    if (!Number.isInteger(page) || page < 0 || page > 10000) return partyError(400, 'invalid_page', 'Некорректная страница', 'validation')
    const scope = params.get('scope') || 'all'
    if (!['all', 'overdue'].includes(scope)) return partyError(400, 'invalid_scope', 'Некорректная очередь', 'validation')
    const salesStage = params.get('salesStage') || ''
    if (salesStage && !Object.hasOwn(PARTY_INBOX_SALES_STAGES, salesStage)) return partyError(400, 'invalid_sales_stage', 'Некорректный этап продаж', 'validation')
    const search = params.get('q')?.trim() || ''
    if (search.length > 120 || /[\u0000-\u001f\u007f]/u.test(search)) return partyError(400, 'invalid_search', 'Введите до 120 символов в поле поиска', 'validation')
    const channel = params.get('channel') || ''
    if (channel && !PARTY_INBOX_CHANNELS.includes(channel)) return partyError(400, 'invalid_channel', 'Некорректный канал', 'validation')
    const status = params.get('status') || ''
    if (status && !Object.hasOwn(PARTY_INBOX_STATUSES, status)) return partyError(400, 'invalid_status', 'Некорректное состояние диалога', 'validation')
    const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
    const channels = PARTY_INBOX_CHANNELS.filter((name) => name !== 'telegram' || tariff.access?.allowTelegramIntegration)
    const selectedChannels = channel ? channels.filter((name) => name === channel) : channels
    const filters = { tenantId: context.tenantId, page, salesStage, search, status }
    const results = scope === 'overdue'
      ? [await loadPartyInboxOverdue({ ...filters, channels: selectedChannels })]
      : await Promise.all(selectedChannels.map((name) => loadPartyInboxChannel({ ...filters, channel: name })))
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
      items: scope === 'overdue' ? results[0].items : results.flatMap((result) => result.items).sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt)),
      hasMore: results.some((result) => result.hasMore), page, channels, options, scope,
    } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return partyError(500, 'inbox_load_failed', 'Не удалось загрузить входящие')
  }
}
