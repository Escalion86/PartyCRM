import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyVkConversationModel,
  getPartyVkMessageModel,
} from '@server/partyModels'
import { createPartyPublicLeadOrder } from '@server/partyPublicLeadService'
import { normalizePartyPublicLeadPayload } from '@server/partyPublicLeadCore'
import { saveIncomingPartyVkMessage } from '@server/partyMessengerPersistence'
import { registerPartyInboxIncoming } from '@server/partyInboxLifecycle'
import {
  isPartyVkWebhookSecretValid,
  normalizePartyVkWebhookLead,
} from '@helpers/partyIntegrationWebhooks'
import {
  findVkGroupByWebhookToken,
  updateVkGroupInIntegrations,
} from '@server/partyVkGroups'

const getToken = async (params) => String((await params)?.token || '').trim()

const jsonError = (message, status = 400) =>
  NextResponse.json({ success: false, error: message }, { status })

const okText = (value = 'ok') =>
  new Response(value, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

const findCompanyByWebhookToken = async (token) => {
  if (!token) return null
  const PartyCompanies = await getPartyCompanyModel()
  return PartyCompanies.findOne({
    status: { $ne: 'archived' },
    'settings.integrations.vkGroups.webhookToken': token,
  })
    .select({ title: 1, settings: 1 })
    .lean()
}

const updateVkDiagnostics = async ({ companyId, integrations, group, patch }) => {
  const PartyCompanies = await getPartyCompanyModel()
  const nextIntegrations = updateVkGroupInIntegrations(
    integrations,
    group.webhookToken || group.id || group.groupId,
    patch
  )
  return PartyCompanies.updateOne(
    { _id: companyId },
    { $set: { 'settings.integrations': nextIntegrations } }
  )
}

export async function POST(req, { params }) {
  const token = await getToken(params)
  const company = await findCompanyByWebhookToken(token)
  if (!company) return jsonError('invalid_vk_webhook_token', 404)

  const integrations = company?.settings?.integrations ?? {}
  const vkGroup = findVkGroupByWebhookToken(integrations, token)
  if (!vkGroup) return jsonError('invalid_vk_webhook_token', 404)
  const body = await req.json().catch(() => ({}))

  if (body?.type === 'confirmation') {
    return okText(vkGroup.confirmationCode || '')
  }

  if (vkGroup.enabled !== true) {
    return jsonError('vk_integration_disabled', 403)
  }

  if (
    !isPartyVkWebhookSecretValid({
      expectedSecret: vkGroup.webhookSecret,
      body,
    })
  ) {
    await updateVkDiagnostics({
      companyId: company._id,
      integrations,
      group: vkGroup,
      patch: {
        lastError: 'invalid_vk_webhook_secret',
        lastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError('invalid_vk_webhook_secret', 403)
  }

  if (body?.type && body.type !== 'message_new') {
    await updateVkDiagnostics({
      companyId: company._id,
      integrations,
      group: vkGroup,
      patch: {
        lastWebhookAt: new Date().toISOString(),
        lastError: '',
      },
    })
    return okText()
  }

  const sourceLead = normalizePartyVkWebhookLead(body)
  sourceLead.source = vkGroup.name || 'VK'
  sourceLead.sourceLabel = vkGroup.name || 'VK'
  sourceLead.vkIntegrationName = vkGroup.name || ''
  const normalized = normalizePartyPublicLeadPayload(sourceLead)

  if (
    sourceLead.vkGroupId &&
    vkGroup.groupId &&
    sourceLead.vkGroupId !== vkGroup.groupId
  ) {
    await updateVkDiagnostics({
      companyId: company._id,
      integrations,
      group: vkGroup,
      patch: {
        lastError: 'invalid_vk_group_id',
        lastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError('invalid_vk_group_id', 403)
  }

  if (!normalized.comment && !normalized.clientName) {
    await updateVkDiagnostics({
      companyId: company._id,
      integrations,
      group: vkGroup,
      patch: {
        lastError: 'empty_vk_message',
        lastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError('empty_vk_message', 400)
  }

  try {
    const { client, order } = await createPartyPublicLeadOrder({
      company,
      normalized,
      rawPayload: body,
      registerInboxIncoming: registerPartyInboxIncoming,
      apiKeyData: {
        id: vkGroup.id || vkGroup.webhookToken || 'vk_group',
        name: vkGroup.name || 'VK',
      },
    })
    await saveIncomingPartyVkMessage({
      models: {
        Conversation: await getPartyVkConversationModel(),
        Message: await getPartyVkMessageModel(),
      },
      tenantId: company._id,
      clientId: client?._id ?? null,
      orderId: order?._id ?? null,
      normalized: sourceLead,
      rawPayload: body,
    })

    await updateVkDiagnostics({
      companyId: company._id,
      integrations,
      group: vkGroup,
      patch: {
        status: 'connected',
        lastError: '',
        lastWebhookAt: new Date().toISOString(),
        lastPeerId: sourceLead.leadExternalId || '',
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        orderId: String(order?._id || ''),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'party_vk_webhook_failed'
    await updateVkDiagnostics({
      companyId: company._id,
      integrations,
      group: vkGroup,
      patch: {
        lastError: message,
        lastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError(message, 500)
  }
}
