import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyVkConversationModel,
  getPartyVkMessageModel,
} from '@server/partyModels'
import { createPartyPublicLeadOrder } from '@server/partyPublicLeadService'
import { normalizePartyPublicLeadPayload } from '@server/partyPublicLeadCore'
import { saveIncomingPartyVkMessage } from '@server/partyMessengerPersistence'
import {
  isPartyVkWebhookSecretValid,
  normalizePartyVkWebhookLead,
} from '@helpers/partyIntegrationWebhooks'

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
    'settings.integrations.vkGroupWebhookToken': token,
  })
    .select({ title: 1, settings: 1 })
    .lean()
}

const updateVkDiagnostics = async ({ companyId, patch }) => {
  const PartyCompanies = await getPartyCompanyModel()
  return PartyCompanies.updateOne(
    { _id: companyId },
    {
      $set: Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [
          `settings.integrations.${key}`,
          value,
        ])
      ),
    }
  )
}

export async function POST(req, { params }) {
  const token = await getToken(params)
  const company = await findCompanyByWebhookToken(token)
  if (!company) return jsonError('invalid_vk_webhook_token', 404)

  const integrations = company?.settings?.integrations ?? {}
  const body = await req.json().catch(() => ({}))

  if (body?.type === 'confirmation') {
    return okText(integrations.vkGroupConfirmationCode || '')
  }

  if (integrations.vkGroupEnabled !== true) {
    return jsonError('vk_integration_disabled', 403)
  }

  if (
    !isPartyVkWebhookSecretValid({
      expectedSecret: integrations.vkGroupWebhookSecret,
      body,
    })
  ) {
    await updateVkDiagnostics({
      companyId: company._id,
      patch: {
        vkGroupLastError: 'invalid_vk_webhook_secret',
        vkGroupLastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError('invalid_vk_webhook_secret', 403)
  }

  if (body?.type && body.type !== 'message_new') {
    await updateVkDiagnostics({
      companyId: company._id,
      patch: {
        vkGroupLastWebhookAt: new Date().toISOString(),
        vkGroupLastError: '',
      },
    })
    return okText()
  }

  const sourceLead = normalizePartyVkWebhookLead(body)
  const normalized = normalizePartyPublicLeadPayload(sourceLead)

  if (!normalized.comment && !normalized.clientName) {
    await updateVkDiagnostics({
      companyId: company._id,
      patch: {
        vkGroupLastError: 'empty_vk_message',
        vkGroupLastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError('empty_vk_message', 400)
  }

  try {
    const { client, order } = await createPartyPublicLeadOrder({
      company,
      normalized,
      rawPayload: body,
      apiKeyData: {
        id: 'vk_group',
        name: 'VK',
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
      patch: {
        vkGroupStatus: 'connected',
        vkGroupLastError: '',
        vkGroupLastWebhookAt: new Date().toISOString(),
        vkGroupLastPeerId: sourceLead.leadExternalId || '',
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
      patch: {
        vkGroupLastError: message,
        vkGroupLastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError(message, 500)
  }
}
