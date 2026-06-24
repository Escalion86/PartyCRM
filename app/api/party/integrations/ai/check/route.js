import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  partyError,
} from '@server/partyApi'
import { normalizeAiSettings } from '@server/aiSettings'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { access } = await getPartyCompanyTariffAccessState(context.company)
  if (!access.allowAi) {
    return partyError(
      403,
      'partycrm_tariff_ai_unavailable',
      'AI недоступен на текущем тарифе компании',
      'permission'
    )
  }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}
  const checkedAt = new Date().toISOString()
  const ai = normalizeAiSettings(integrations)
  const lastError = ai.aitunnelKey ? '' : 'aitunnel_key_required'
  const nextIntegrations = {
    ...integrations,
    aiLastCheckedAt: checkedAt,
    aiLastError: lastError,
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: {
        'settings.integrations.aiLastCheckedAt': checkedAt,
        'settings.integrations.aiLastError': lastError,
      },
    }
  )

  return NextResponse.json({
    success: true,
    data: normalizeAiSettings(nextIntegrations),
  })
}
