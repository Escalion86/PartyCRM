import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { normalizeAvitoSettings } from '@server/avito'
import { normalizeVkSettings } from '@server/vkGroup'
import { normalizeNovofonSettings } from '@server/novofon'
import { normalizeAiSettings } from '@server/aiSettings'

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

  return NextResponse.json({
    success: true,
    data: {
      avito: normalizeAvitoSettings(integrations),
      vk: normalizeVkSettings(integrations),
      novofon: normalizeNovofonSettings(integrations),
      ai: normalizeAiSettings(integrations),
    },
  })
}
