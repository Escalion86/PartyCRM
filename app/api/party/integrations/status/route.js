import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { normalizeAvitoSettings } from '@server/avito'
import { normalizeNovofonSettings } from '@server/novofon'
import { normalizeAiSettings } from '@server/aiSettings'
import {
  LEGACY_VK_KEYS,
  normalizePartyVkSettings,
  normalizePartyVkGroups,
  removeLegacyVkKeys,
} from '@server/partyVkGroups'
import {
  normalizePartyTelegramSettings,
  publicPartyTelegramStatus,
} from '@server/partyTelegramBusiness'

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
  const hasLegacyVk = LEGACY_VK_KEYS.some(
    (key) => integrations[key] !== undefined
  )
  const nextIntegrations = hasLegacyVk
    ? {
        ...removeLegacyVkKeys(integrations),
        vkGroups: normalizePartyVkGroups(integrations),
      }
    : integrations

  if (hasLegacyVk) {
    await PartyCompanies.updateOne(
      { _id: context.tenantId },
      { $set: { 'settings.integrations': nextIntegrations } }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      avito: normalizeAvitoSettings(nextIntegrations),
      vk: normalizePartyVkSettings(nextIntegrations),
      novofon: normalizeNovofonSettings(nextIntegrations),
      ai: normalizeAiSettings(nextIntegrations),
      telegram: publicPartyTelegramStatus(
        normalizePartyTelegramSettings(nextIntegrations)
      ),
    },
  })
}
