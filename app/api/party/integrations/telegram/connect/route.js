import { NextResponse } from 'next/server'
import { parseJsonBody } from '@server/partyApi'
import { getPartyTelegramRequestContext } from '@server/partyTelegramAccess'
import {
  buildPartyTelegramWebhookUrl,
  checkPartyTelegramBot,
  createPartyTelegramWebhookSecret,
  createPartyTelegramWebhookToken,
  deletePartyTelegramWebhook,
  getPartyTelegramTransportStatus,
  normalizePartyTelegramSettings,
  publicPartyTelegramStatus,
  setPartyTelegramWebhook,
  updatePartyTelegramSettings,
} from '@server/partyTelegramBusiness'

export async function POST(req) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const body = await parseJsonBody(req)
  const botToken = String(body?.botToken || '').trim()
  if (!botToken) return NextResponse.json({ success: false, error: { message: 'Укажите токен бота из BotFather' } }, { status: 400 })

  const integrations = context.company?.settings?.integrations || {}
  const current = normalizePartyTelegramSettings(integrations)
  const webhookToken = current.webhookToken || createPartyTelegramWebhookToken()
  const webhookSecret = current.webhookSecret || createPartyTelegramWebhookSecret()
  const webhookUrl = buildPartyTelegramWebhookUrl({ req, token: webhookToken })
  const sameBot = current.botToken === botToken
  try {
    const bot = await checkPartyTelegramBot({ botToken })
    if (!bot?.is_bot) return NextResponse.json({ success: false, error: { message: 'Указанный токен не принадлежит боту' } }, { status: 400 })
    if (current.botToken && !sameBot) await deletePartyTelegramWebhook({ botToken: current.botToken }).catch(() => null)
    await setPartyTelegramWebhook({ botToken, webhookUrl, webhookSecret })
    const now = new Date().toISOString()
    await updatePartyTelegramSettings({
      companyId: context.tenantId,
      patch: {
        telegramBusinessEnabled: true,
        telegramBusinessBotToken: botToken,
        telegramBusinessBotId: String(bot.id || ''),
        telegramBusinessBotUsername: String(bot.username || ''),
        telegramBusinessWebhookToken: webhookToken,
        telegramBusinessWebhookSecret: webhookSecret,
        telegramBusinessWebhookUrl: webhookUrl,
        telegramBusinessConnectionId: sameBot ? current.businessConnectionId : '',
        telegramBusinessAccountUserId: sameBot ? current.businessAccountUserId : '',
        telegramBusinessRights: sameBot ? current.rights : null,
        telegramBusinessStatus: sameBot && current.businessConnectionId ? 'connected' : 'bot_ready',
        telegramBusinessLastError: '',
        telegramBusinessLastCheckedAt: now,
      },
    })
    return NextResponse.json({ success: true, data: publicPartyTelegramStatus({ ...current, enabled: true, botToken, botId: String(bot.id || ''), botUsername: String(bot.username || ''), status: sameBot && current.businessConnectionId ? 'connected' : 'bot_ready', lastCheckedAt: now }) })
  } catch (connectError) {
    const message = connectError?.message || 'Не удалось подключить Telegram-бота'
    await updatePartyTelegramSettings({ companyId: context.tenantId, patch: { telegramBusinessEnabled: false, telegramBusinessStatus: 'auth_error', telegramBusinessLastError: message.slice(0, 500), telegramBusinessLastCheckedAt: new Date().toISOString() } })
    return NextResponse.json({ success: false, error: { message }, data: getPartyTelegramTransportStatus() }, { status: 400 })
  }
}
