import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  buildAvitoWebhookUrl,
  createWebhookToken,
  normalizeAvitoSettings,
  registerAvitoWebhook,
  requestAvitoAccessToken,
  updateAvitoCustom,
} from '@server/avito'
import SiteSettings from '@models/SiteSettings'
import getUserTariffAccess from '@server/getUserTariffAccess'

const jsonError = (message, status = 400, code = 'avito_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'avito', message } },
    { status }
  )

export const POST = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const body = await req.json().catch(() => ({}))
  const clientId = String(body?.clientId || '').trim()
  const clientSecret = String(body?.clientSecret || '').trim()
  const userId = String(body?.userId || '').trim()

  if (!clientId || !clientSecret) {
    return jsonError('Укажите Client ID и Client Secret', 400, 'missing_credentials')
  }

  await dbConnect()
  const access = await getUserTariffAccess(tenantId)
  if (!access?.trialActive && !access?.hasTariff) {
    return jsonError('Не выбран тариф', 403, 'tariff_required')
  }

  const currentSettings = await SiteSettings.findOne({ tenantId }).lean()
  const currentAvito = normalizeAvitoSettings(currentSettings?.custom)
  const webhookToken = currentAvito.webhookToken || createWebhookToken()
  const webhookUrl = buildAvitoWebhookUrl({ req, token: webhookToken })

  let tokenPayload = null
  try {
    tokenPayload = await requestAvitoAccessToken({ clientId, clientSecret })
  } catch (error) {
    const updated = await updateAvitoCustom({
      tenantId,
      patch: {
        avitoEnabled: false,
        avitoClientId: clientId,
        avitoClientSecret: clientSecret,
        avitoUserId: userId,
        avitoWebhookToken: webhookToken,
        avitoWebhookUrl: webhookUrl,
        avitoStatus: 'auth_error',
        avitoLastError: String(error?.message || error).slice(0, 1000),
        avitoLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'auth_error',
          type: 'avito',
          message: 'Avito не принял Client ID / Client Secret',
        },
        data: updated,
      },
      { status: 400 }
    )
  }

  const webhookResult = await registerAvitoWebhook({
    accessToken: tokenPayload.access_token,
    webhookUrl,
  })
  const webhookRegistered = webhookResult?.ok === true
  const status = webhookRegistered ? 'connected' : 'webhook_manual'
  const updated = await updateAvitoCustom({
    tenantId,
    patch: {
      avitoEnabled: true,
      avitoClientId: clientId,
      avitoClientSecret: clientSecret,
      avitoUserId: userId,
      avitoWebhookToken: webhookToken,
      avitoWebhookUrl: webhookUrl,
      avitoWebhookId: webhookResult?.webhookId || '',
      avitoStatus: status,
      avitoLastError: webhookRegistered
        ? ''
        : String(webhookResult?.error || 'webhook registration failed').slice(
            0,
            1000
          ),
      avitoConnectedAt: new Date().toISOString(),
      avitoLastCheckedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        siteSettings: updated,
        avito: {
          status,
          webhookUrl,
          webhookRegistered,
          webhookError: webhookRegistered ? '' : webhookResult?.error || '',
        },
      },
    },
    { status: 200 }
  )
}
