import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { buildPartyVkWebhookUrl } from '@helpers/partyIntegrationWebhooks'
import {
  checkVkGroupAccess,
  createVkWebhookToken,
  createVkWebhookSecret,
} from '@server/vkGroup'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const { groupId, accessToken, confirmationCode } = body

  if (!groupId || !accessToken) {
    return NextResponse.json(
      { success: false, error: 'groupId и accessToken обязательны' },
      { status: 400 }
    )
  }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}
  const webhookToken =
    integrations.vkGroupWebhookToken || createVkWebhookToken()
  const webhookSecret =
    integrations.vkGroupWebhookSecret || createVkWebhookSecret()
  const webhookUrl = buildPartyVkWebhookUrl({ req, token: webhookToken })

  try {
    await checkVkGroupAccess({ accessToken, groupId })

    const nextIntegrations = {
      ...integrations,
      vkGroupEnabled: true,
      vkGroupId: groupId,
      vkGroupAccessToken: accessToken,
      vkGroupConfirmationCode: confirmationCode || '',
      vkGroupWebhookToken: webhookToken,
      vkGroupWebhookSecret: webhookSecret,
      vkGroupWebhookUrl: webhookUrl,
      vkGroupStatus: 'connected',
      vkGroupLastError: '',
      vkGroupConnectedAt: new Date().toISOString(),
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
        status: 'connected',
        webhookUrl,
        webhookSecret,
      },
    })
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Ошибка подключения VK'

    const nextIntegrations = {
      ...integrations,
      vkGroupId: groupId,
      vkGroupAccessToken: accessToken,
      vkGroupConfirmationCode: confirmationCode || '',
      vkGroupWebhookToken: webhookToken,
      vkGroupWebhookSecret: webhookSecret,
      vkGroupWebhookUrl: webhookUrl,
      vkGroupStatus: 'error',
      vkGroupLastError: errorMessage,
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
