import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import SiteSettings from '@models/SiteSettings'
import {
  buildAvitoWebhookUrl,
  normalizeAvitoSettings,
  requestAvitoAccessToken,
  updateAvitoCustom,
} from '@server/avito'

const jsonError = (message, status = 400, code = 'avito_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'avito', message } },
    { status }
  )

export const GET = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const avito = normalizeAvitoSettings(siteSettings?.custom)
  const webhookUrl =
    avito.webhookUrl ||
    buildAvitoWebhookUrl({ req, token: avito.webhookToken || '' })

  return NextResponse.json(
    {
      success: true,
      data: {
        ...avito,
        clientSecret: avito.clientSecret ? '********' : '',
        webhookUrl,
      },
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const avito = normalizeAvitoSettings(siteSettings?.custom)
  if (!avito.clientId || !avito.clientSecret) {
    return jsonError('Avito не настроен', 400, 'not_configured')
  }

  try {
    await requestAvitoAccessToken({
      clientId: avito.clientId,
      clientSecret: avito.clientSecret,
    })
    const updated = await updateAvitoCustom({
      tenantId,
      patch: {
        avitoStatus: avito.status || 'connected',
        avitoLastError: '',
        avitoLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: true,
        data: {
          siteSettings: updated,
          avito: normalizeAvitoSettings(updated?.custom),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const updated = await updateAvitoCustom({
      tenantId,
      patch: {
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
          message: 'Avito не принял текущие учетные данные',
        },
        data: {
          siteSettings: updated,
          avito: normalizeAvitoSettings(updated?.custom),
        },
      },
      { status: 400 }
    )
  }
}
