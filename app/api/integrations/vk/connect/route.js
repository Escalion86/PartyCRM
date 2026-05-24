import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import SiteSettings from '@models/SiteSettings'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  backfillVkLeadClients,
  buildVkWebhookUrl,
  checkVkGroupAccess,
  createVkWebhookSecret,
  createVkWebhookToken,
  normalizeVkSettings,
  updateVkCustom,
} from '@server/vkGroup'

const jsonError = (message, status = 400, code = 'vk_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'vk_group', message } },
    { status }
  )

export const POST = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const body = await req.json().catch(() => ({}))
  const groupId = String(body?.groupId || '').trim()
  const accessToken = String(body?.accessToken || '').trim()
  const confirmationCode = String(body?.confirmationCode || '').trim()
  const requestedWebhookToken = String(body?.webhookToken || '').trim()
  const requestedWebhookSecret = String(body?.webhookSecret || '').trim()

  if (!groupId || !accessToken || !confirmationCode) {
    return jsonError(
      'Укажите Group ID, токен сообщества и строку подтверждения',
      400,
      'missing_credentials'
    )
  }

  await dbConnect()
  const access = await getUserTariffAccess(tenantId)
  if (!access?.trialActive && !access?.hasTariff) {
    return jsonError('Не выбран тариф', 403, 'tariff_required')
  }

  const currentSettings = await SiteSettings.findOne({ tenantId }).lean()
  const currentVk = normalizeVkSettings(currentSettings?.custom)
  const webhookToken =
    currentVk.webhookToken ||
    (requestedWebhookToken.startsWith('vk_')
      ? requestedWebhookToken.slice(0, 160)
      : '') ||
    createVkWebhookToken()
  const webhookSecret =
    currentVk.webhookSecret ||
    (requestedWebhookSecret.startsWith('vksec_')
      ? requestedWebhookSecret.slice(0, 160)
      : '') ||
    createVkWebhookSecret()
  const webhookUrl = buildVkWebhookUrl({ req, token: webhookToken })

  try {
    await checkVkGroupAccess({ accessToken, groupId })
  } catch (error) {
    const updated = await updateVkCustom({
      tenantId,
      patch: {
        vkGroupEnabled: false,
        vkGroupId: groupId,
        vkGroupAccessToken: accessToken,
        vkGroupConfirmationCode: confirmationCode,
        vkGroupWebhookToken: webhookToken,
        vkGroupWebhookSecret: webhookSecret,
        vkGroupWebhookUrl: webhookUrl,
        vkGroupStatus: 'auth_error',
        vkGroupLastError: String(error?.message || error).slice(0, 1000),
        vkGroupLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'auth_error',
          type: 'vk_group',
          message: 'VK не принял токен сообщества',
        },
        data: { siteSettings: updated },
      },
      { status: 400 }
    )
  }

  const updated = await updateVkCustom({
    tenantId,
    patch: {
      vkGroupEnabled: true,
      vkGroupId: groupId,
      vkGroupAccessToken: accessToken,
      vkGroupConfirmationCode: confirmationCode,
      vkGroupWebhookToken: webhookToken,
      vkGroupWebhookSecret: webhookSecret,
      vkGroupWebhookUrl: webhookUrl,
      vkGroupStatus: 'connected',
      vkGroupLastError: '',
      vkGroupConnectedAt: new Date().toISOString(),
      vkGroupLastCheckedAt: new Date().toISOString(),
    },
  })
  const backfill = await backfillVkLeadClients({ tenantId })

  return NextResponse.json(
    {
      success: true,
      data: {
        siteSettings: updated,
        vkGroup: { status: 'connected', webhookUrl, webhookSecret, backfill },
      },
    },
    { status: 200 }
  )
}
