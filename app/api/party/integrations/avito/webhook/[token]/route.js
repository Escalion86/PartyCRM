import { NextResponse } from 'next/server'
import {
  getPartyAvitoConversationModel,
  getPartyAvitoMessageModel,
  getPartyCompanyModel,
} from '@server/partyModels'
import { createPartyPublicLeadOrder } from '@server/partyPublicLeadService'
import { normalizePartyPublicLeadPayload } from '@server/partyPublicLeadCore'
import { saveIncomingPartyAvitoMessage } from '@server/partyMessengerPersistence'
import { registerPartyInboxIncoming } from '@server/partyInboxLifecycle'
import { normalizePartyAvitoWebhookLead } from '@helpers/partyIntegrationWebhooks'

const getToken = async (params) => String((await params)?.token || '').trim()

const jsonError = (message, status = 400) =>
  NextResponse.json({ success: false, error: message }, { status })

const findCompanyByWebhookToken = async (token) => {
  if (!token) return null
  const PartyCompanies = await getPartyCompanyModel()
  return PartyCompanies.findOne({
    status: { $ne: 'archived' },
    'settings.integrations.avitoWebhookToken': token,
  })
    .select({ title: 1, settings: 1 })
    .lean()
}

const updateAvitoDiagnostics = async ({ companyId, patch }) => {
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
  if (!company) return jsonError('invalid_avito_webhook_token', 404)

  const integrations = company?.settings?.integrations ?? {}
  if (integrations.avitoEnabled !== true) {
    return jsonError('avito_integration_disabled', 403)
  }

  const body = await req.json().catch(() => ({}))
  const sourceLead = normalizePartyAvitoWebhookLead(body)
  const normalized = normalizePartyPublicLeadPayload(sourceLead)

  if (!normalized.comment && !normalized.clientName) {
    await updateAvitoDiagnostics({
      companyId: company._id,
      patch: {
        avitoLastError: 'empty_avito_message',
        avitoLastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError('empty_avito_message', 400)
  }

  try {
    const { client, order } = await createPartyPublicLeadOrder({
      company,
      normalized,
      rawPayload: body,
      registerInboxIncoming: registerPartyInboxIncoming,
      apiKeyData: {
        id: 'avito',
        name: 'Avito',
      },
    })
    await saveIncomingPartyAvitoMessage({
      models: {
        Conversation: await getPartyAvitoConversationModel(),
        Message: await getPartyAvitoMessageModel(),
      },
      tenantId: company._id,
      clientId: client?._id ?? null,
      orderId: order?._id ?? null,
      normalized: sourceLead,
      rawPayload: body,
    })

    await updateAvitoDiagnostics({
      companyId: company._id,
      patch: {
        avitoStatus: 'connected',
        avitoLastError: '',
        avitoLastWebhookAt: new Date().toISOString(),
        avitoLastChatId: sourceLead.leadExternalId || '',
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        orderId: String(order?._id || ''),
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'party_avito_webhook_failed'
    await updateAvitoDiagnostics({
      companyId: company._id,
      patch: {
        avitoLastError: message,
        avitoLastWebhookAt: new Date().toISOString(),
      },
    })
    return jsonError(message, 500)
  }
}
