import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import {
  removeLegacyVkKeys,
  removeVkGroupFromIntegrations,
} from '@server/partyVkGroups'

export async function POST(req) {
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
  const body = await parseJsonBody(req)
  const selector = body.id || body.webhookToken || body.groupId || ''
  const cleaned = selector
    ? removeVkGroupFromIntegrations(integrations, selector)
    : { ...removeLegacyVkKeys(integrations), vkGroups: [] }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: { 'settings.integrations': cleaned },
    }
  )

  return NextResponse.json({
    success: true,
    data: { status: 'disconnected', groups: cleaned.vkGroups },
  })
}
