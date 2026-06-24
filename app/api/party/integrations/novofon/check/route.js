import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { normalizeNovofonSettings } from '@server/novofon'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}
  const novofon = normalizeNovofonSettings(integrations)
  const checkedAt = new Date().toISOString()
  const missing = []

  if (!novofon.enabled) missing.push('novofon_disabled')
  if (!novofon.apiKey) missing.push('novofon_api_key_required')
  if (!novofon.webhookSecret) missing.push('novofon_webhook_secret_required')

  const status = missing.length === 0 ? 'connected' : 'error'
  const lastError = missing.join(', ')

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: {
        'settings.integrations.novofonLastCheckedAt': checkedAt,
        'settings.integrations.novofonStatus': status,
        'settings.integrations.novofonLastError': lastError,
      },
    }
  )

  return NextResponse.json({
    success: true,
    data: {
      ...novofon,
      status,
      lastCheckedAt: checkedAt,
      lastError,
    },
  })
}
