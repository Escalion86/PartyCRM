import { NextResponse } from 'next/server'
import { getPartyTelegramRequestContext } from '@server/partyTelegramAccess'
import {
  buildPartyTelegramWebhookUrl,
  checkPartyTelegramBot,
  normalizePartyTelegramSettings,
  publicPartyTelegramStatus,
  setPartyTelegramWebhook,
  updatePartyTelegramSettings,
} from '@server/partyTelegramBusiness'

export async function GET(req) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const settings = normalizePartyTelegramSettings(context.company?.settings?.integrations)
  return NextResponse.json({ success: true, data: publicPartyTelegramStatus(settings) })
}

export async function POST(req) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const settings = normalizePartyTelegramSettings(context.company?.settings?.integrations)
  if (!settings.botToken || !settings.webhookToken || !settings.webhookSecret) {
    return NextResponse.json({ success: false, error: { message: 'Telegram Business не настроен' } }, { status: 400 })
  }
  const webhookUrl = buildPartyTelegramWebhookUrl({ req, token: settings.webhookToken })
  try {
    const bot = await checkPartyTelegramBot({ botToken: settings.botToken })
    await setPartyTelegramWebhook({ botToken: settings.botToken, webhookUrl, webhookSecret: settings.webhookSecret })
    const next = { ...settings, enabled: true, botId: String(bot?.id || ''), botUsername: String(bot?.username || ''), webhookUrl, status: settings.businessConnectionId ? 'connected' : 'bot_ready', lastError: '', lastCheckedAt: new Date().toISOString() }
    await updatePartyTelegramSettings({ companyId: context.tenantId, patch: { telegramBusinessEnabled: true, telegramBusinessBotId: next.botId, telegramBusinessBotUsername: next.botUsername, telegramBusinessWebhookUrl: webhookUrl, telegramBusinessStatus: next.status, telegramBusinessLastError: '', telegramBusinessLastCheckedAt: next.lastCheckedAt } })
    return NextResponse.json({ success: true, data: publicPartyTelegramStatus(next) })
  } catch (statusError) {
    const message = statusError?.message || 'Не удалось проверить Telegram-бота'
    await updatePartyTelegramSettings({ companyId: context.tenantId, patch: { telegramBusinessStatus: 'auth_error', telegramBusinessLastError: message.slice(0, 500), telegramBusinessLastCheckedAt: new Date().toISOString() } })
    return NextResponse.json({ success: false, error: { message } }, { status: 400 })
  }
}
