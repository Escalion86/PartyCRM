import { NextResponse } from 'next/server'
import { getPartyCompanyModel, getPartyTelegramMessageModel } from '@server/partyModels'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { sendPushToTenant } from '@server/pushNotifications'
import {
  normalizePartyTelegramSettings,
  savePartyTelegramBusinessMessage,
  updatePartyTelegramSettings,
} from '@server/partyTelegramBusiness'

const responseError = (message, status, code) => NextResponse.json({ success: false, error: { code, message } }, { status })

export async function POST(req, { params }) {
  const token = String((await params)?.token || '').trim()
  if (!token) return responseError('Token required', 400, 'missing_token')

  const Companies = await getPartyCompanyModel()
  const company = await Companies.findOne({
    status: { $ne: 'archived' },
    'settings.integrations.telegramBusinessWebhookToken': token,
  }).lean()
  if (!company?._id) return responseError('Forbidden', 403, 'forbidden')

  const settings = normalizePartyTelegramSettings(company.settings?.integrations)
  const secret = String(req.headers.get('x-telegram-bot-api-secret-token') || '')
  if (!settings.webhookSecret || secret !== settings.webhookSecret) return responseError('Forbidden', 403, 'bad_secret')
  if (!settings.enabled) return responseError('Integration disabled', 403, 'disabled')
  const tariff = await getPartyCompanyTariffAccessState(company._id)
  if (!tariff.access?.allowTelegramIntegration) return responseError('Telegram integration is unavailable', 403, 'tariff_required')

  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()
  const connection = body?.business_connection
  if (connection) {
    await updatePartyTelegramSettings({ companyId: company._id, patch: {
      telegramBusinessConnectionId: connection.is_enabled ? String(connection.id || '') : '',
      telegramBusinessAccountUserId: connection.is_enabled ? String(connection?.user?.id || '') : '',
      telegramBusinessRights: connection.rights || null,
      telegramBusinessStatus: connection.is_enabled ? 'connected' : 'bot_ready',
      telegramBusinessConnectedAt: connection.is_enabled ? now : null,
      telegramBusinessLastWebhookAt: now,
      telegramBusinessLastError: '',
    } })
    return NextResponse.json({ ok: true })
  }

  const message = body?.business_message || body?.edited_business_message
  if (message) {
    const result = await savePartyTelegramBusinessMessage({
      tenantId: company._id,
      settings: { ...settings, businessConnectionId: settings.businessConnectionId || message.business_connection_id },
      message,
    })
    if (result?.clientCreated && company.settings?.notifications?.pushEnabled === true) {
      const name = [result.client?.firstName, result.client?.secondName].filter(Boolean).join(' ') || 'Новый контакт'
      await sendPushToTenant({
        tenantId: company._id,
        source: 'party_telegram_client_created',
        payload: {
          title: 'Создан клиент из Telegram',
          body: `${name} написал компании. Карточка создана автоматически.`,
          tag: `party-telegram-client-${result.client._id}`,
          data: { url: '/company/clients', clientId: String(result.client._id), type: 'telegram_client_created' },
        },
      }).catch(() => null)
    }
    await updatePartyTelegramSettings({ companyId: company._id, patch: {
      telegramBusinessConnectionId: String(message.business_connection_id || settings.businessConnectionId || ''),
      telegramBusinessStatus: 'connected',
      telegramBusinessLastWebhookAt: now,
      telegramBusinessLastMessageAt: result ? now : settings.lastMessageAt,
      telegramBusinessLastError: '',
    } })
    return NextResponse.json({ ok: true })
  }

  const deleted = body?.deleted_business_messages
  if (deleted?.chat?.id && Array.isArray(deleted.message_ids)) {
    const Messages = await getPartyTelegramMessageModel()
    await Messages.deleteMany({ tenantId: company._id, telegramChatId: String(deleted.chat.id), telegramMessageId: { $in: deleted.message_ids.map(String) } })
  }
  await updatePartyTelegramSettings({ companyId: company._id, patch: { telegramBusinessLastWebhookAt: now } })
  return NextResponse.json({ ok: true })
}
