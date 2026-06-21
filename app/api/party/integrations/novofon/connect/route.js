import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { normalizeNovofonSettings } from '@server/novofon'
import { buildPartyNovofonWebhookUrl } from '@helpers/partyIntegrationWebhooks'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const { apiKey, virtualPhone } = body

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'apiKey обязателен' },
      { status: 400 }
    )
  }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}

  const webhookSecret =
    integrations.novofonWebhookSecret ||
    `novofon_${crypto.randomUUID().replace(/-/g, '')}`

  const nextIntegrations = {
    ...integrations,
    novofonEnabled: true,
    novofonApiKey: apiKey,
    novofonVirtualPhone: virtualPhone || '',
    novofonWebhookSecret: webhookSecret,
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: { 'settings.integrations': nextIntegrations },
    }
  )

  const webhookUrl = webhookSecret
    ? buildPartyNovofonWebhookUrl({ req, token: webhookSecret })
    : ''

  return NextResponse.json({
    success: true,
    data: {
      status: 'connected',
      webhookUrl,
      webhookSecret,
      settings: normalizeNovofonSettings(nextIntegrations),
    },
  })
}
