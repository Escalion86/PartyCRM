import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { normalizeAvitoSettings, requestAvitoAccessToken } from '@server/avito'

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
  const avito = normalizeAvitoSettings(integrations)

  const checkedAt = new Date().toISOString()
  let status = 'connected'
  let lastError = ''

  if (!avito.enabled) {
    status = 'disabled'
    lastError = 'avito_disabled'
  } else if (!avito.clientId || !avito.clientSecret) {
    status = 'error'
    lastError = 'avito_credentials_required'
  } else {
    try {
      await requestAvitoAccessToken({
        clientId: avito.clientId,
        clientSecret: avito.clientSecret,
      })
      if (!avito.webhookToken && !avito.webhookUrl) {
        status = 'webhook_missing'
        lastError = 'avito_webhook_required'
      }
    } catch (err) {
      status = 'error'
      lastError = err instanceof Error ? err.message : 'avito_check_failed'
    }
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: {
        'settings.integrations.avitoLastCheckedAt': checkedAt,
        'settings.integrations.avitoStatus': status,
        'settings.integrations.avitoLastError': lastError,
      },
    }
  )

  return NextResponse.json({
    success: true,
    data: {
      ...avito,
      status,
      lastCheckedAt: checkedAt,
      lastError,
    },
  })
}
