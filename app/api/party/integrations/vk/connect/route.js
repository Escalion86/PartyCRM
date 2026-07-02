import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { buildPartyVkWebhookUrl } from '@helpers/partyIntegrationWebhooks'
import {
  checkVkGroupAccess,
  createVkWebhookToken,
  createVkWebhookSecret,
} from '@server/vkGroup'
import {
  normalizePartyVkGroups,
  upsertVkGroupInIntegrations,
} from '@server/partyVkGroups'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const { id, name, groupId, accessToken, confirmationCode } = body

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
  const existingGroup = normalizePartyVkGroups(integrations).find(
    (item) =>
      (id && item.id === id) ||
      (groupId && item.groupId === String(groupId).trim())
  )
  const webhookToken = existingGroup?.webhookToken || createVkWebhookToken()
  const webhookSecret = existingGroup?.webhookSecret || createVkWebhookSecret()
  const webhookUrl = buildPartyVkWebhookUrl({ req, token: webhookToken })

  try {
    await checkVkGroupAccess({ accessToken, groupId })

    const nextIntegrations = upsertVkGroupInIntegrations(integrations, {
      ...existingGroup,
      id: existingGroup?.id || webhookToken,
      name: name || existingGroup?.name || `VK ${groupId}`,
      enabled: true,
      groupId,
      accessToken,
      confirmationCode: confirmationCode || '',
      webhookToken,
      webhookSecret,
      webhookUrl,
      status: 'connected',
      lastError: '',
      connectedAt: new Date().toISOString(),
    })

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
        group: nextIntegrations.vkGroups.find(
          (item) => item.webhookToken === webhookToken
        ),
        webhookUrl,
        webhookSecret,
      },
    })
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Ошибка подключения VK'

    const nextIntegrations = upsertVkGroupInIntegrations(integrations, {
      ...existingGroup,
      id: existingGroup?.id || webhookToken,
      name: name || existingGroup?.name || `VK ${groupId}`,
      enabled: true,
      groupId,
      accessToken,
      confirmationCode: confirmationCode || '',
      webhookToken,
      webhookSecret,
      webhookUrl,
      status: 'error',
      lastError: errorMessage,
    })

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
