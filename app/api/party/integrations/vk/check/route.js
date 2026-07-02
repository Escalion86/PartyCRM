import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { checkVkGroupAccess } from '@server/vkGroup'
import {
  normalizePartyVkSettings,
  normalizePartyVkGroups,
  removeLegacyVkKeys,
} from '@server/partyVkGroups'

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
  const checkedAt = new Date().toISOString()
  const checkedGroups = []

  for (const group of normalizePartyVkGroups(integrations)) {
    let status = 'connected'
    let lastError = ''

    if (!group.enabled) {
      status = 'disabled'
      lastError = 'vk_group_disabled'
    } else if (!group.groupId || !group.accessToken) {
      status = 'error'
      lastError = 'vk_group_credentials_required'
    } else {
      try {
        await checkVkGroupAccess({
          accessToken: group.accessToken,
          groupId: group.groupId,
        })
      } catch (err) {
        status = 'error'
        lastError = err instanceof Error ? err.message : 'vk_group_check_failed'
      }
    }

    checkedGroups.push({
      ...group,
      status,
      lastError,
      lastCheckedAt: checkedAt,
    })
  }

  const nextIntegrations = {
    ...removeLegacyVkKeys(integrations),
    vkGroups: checkedGroups,
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: { 'settings.integrations': nextIntegrations },
    }
  )

  return NextResponse.json({
    success: true,
    data: {
      ...normalizePartyVkSettings(nextIntegrations),
      lastCheckedAt: checkedAt,
    },
  })
}
