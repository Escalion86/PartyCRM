import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import {
  filterCompanySettingsPatchByTariffAccess,
  mergeCompanySettingsPatch,
  normalizeCompanySettings,
} from '@helpers/companySettings'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1, tariffId: 1, trialEndsAt: 1 })
    .lean()
  const { serializedAccess } = await getPartyCompanyTariffAccessState(company)

  return NextResponse.json({
    success: true,
    data: {
      settings: normalizeCompanySettings(company?.settings ?? {}),
      access: serializedAccess,
    },
  })
}

export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1, tariffId: 1, trialEndsAt: 1 })
    .lean()
  const { access, serializedAccess } = await getPartyCompanyTariffAccessState(
    company
  )
  const filteredBody = filterCompanySettingsPatchByTariffAccess(body, access)
  const nextSettings = mergeCompanySettingsPatch(
    company?.settings ?? {},
    filteredBody
  )

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: { settings: nextSettings } }
  )

  return NextResponse.json({
    success: true,
    data: {
      settings: nextSettings,
      access: serializedAccess,
    },
  })
}
