import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import {
  requestAvitoAccessToken,
  registerAvitoWebhook,
  buildAvitoWebhookUrl,
  createWebhookToken,
} from '@server/avito'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const { clientId, clientSecret, userId } = body

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { success: false, error: 'clientId и clientSecret обязательны' },
      { status: 400 }
    )
  }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}
  const webhookToken =
    integrations.avitoWebhookToken || createWebhookToken()
  const webhookUrl = buildAvitoWebhookUrl({ req, token: webhookToken })

  try {
    const tokenResponse = await requestAvitoAccessToken({
      clientId,
      clientSecret,
    })
    const webhookResponse = await registerAvitoWebhook({
      accessToken: tokenResponse.access_token,
      webhookUrl,
    })

    const nextIntegrations = {
      ...integrations,
      avitoEnabled: true,
      avitoClientId: clientId,
      avitoClientSecret: clientSecret,
      avitoUserId: userId || '',
      avitoWebhookToken: webhookToken,
      avitoWebhookUrl: webhookUrl,
      avitoWebhookId: webhookResponse.webhookId || '',
      avitoStatus: webhookResponse.ok ? 'connected' : 'webhook_failed',
      avitoLastError: webhookResponse.ok ? '' : (webhookResponse.error || ''),
      avitoConnectedAt: new Date().toISOString(),
    }

    await PartyCompanies.updateOne(
      { _id: context.tenantId },
      {
        $set: { 'settings.integrations': nextIntegrations },
      }
    )

    return NextResponse.json({
      success: true,
      data: {
        status: nextIntegrations.avitoStatus,
        webhookUrl,
        webhookId: nextIntegrations.avitoWebhookId,
      },
    })
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Ошибка подключения Avito'

    const nextIntegrations = {
      ...integrations,
      avitoClientId: clientId,
      avitoClientSecret: clientSecret,
      avitoUserId: userId || '',
      avitoWebhookToken: webhookToken,
      avitoWebhookUrl: webhookUrl,
      avitoStatus: 'error',
      avitoLastError: errorMessage,
    }

    await PartyCompanies.updateOne(
      { _id: context.tenantId },
      {
        $set: { 'settings.integrations': nextIntegrations },
      }
    )

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
