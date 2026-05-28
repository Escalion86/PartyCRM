import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { normalizeVkSettings } from '@server/vkGroup'

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
  const vk = normalizeVkSettings(integrations)

  const checkedAt = new Date().toISOString()

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: { 'settings.integrations.vkGroupLastCheckedAt': checkedAt },
    }
  )

  return NextResponse.json({
    success: true,
    data: { ...vk, lastCheckedAt: checkedAt },
  })
}
