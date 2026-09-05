import { NextResponse } from 'next/server'
import { getPartyTelegramRequestContext } from '@server/partyTelegramAccess'
import { deletePartyTelegramWebhook, normalizePartyTelegramSettings, updatePartyTelegramSettings } from '@server/partyTelegramBusiness'

export async function POST(req) {
  const { context, error } = await getPartyTelegramRequestContext(req)
  if (error) return error
  const settings = normalizePartyTelegramSettings(context.company?.settings?.integrations)
  if (settings.botToken) await deletePartyTelegramWebhook({ botToken: settings.botToken }).catch(() => null)
  await updatePartyTelegramSettings({ companyId: context.tenantId, patch: {
    telegramBusinessEnabled: false,
    telegramBusinessBotToken: '',
    telegramBusinessBotId: '',
    telegramBusinessBotUsername: '',
    telegramBusinessWebhookToken: '',
    telegramBusinessWebhookSecret: '',
    telegramBusinessWebhookUrl: '',
    telegramBusinessConnectionId: '',
    telegramBusinessAccountUserId: '',
    telegramBusinessRights: null,
    telegramBusinessStatus: 'disabled',
    telegramBusinessLastError: '',
    telegramBusinessLastCheckedAt: new Date().toISOString(),
  } })
  return NextResponse.json({ success: true })
}
