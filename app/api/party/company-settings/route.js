import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import {
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
    .select({ settings: 1 })
    .lean()

  return NextResponse.json({
    success: true,
    data: normalizeCompanySettings(company?.settings ?? {}),
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
    .select({ settings: 1 })
    .lean()
  const nextSettings = mergeCompanySettingsPatch(company?.settings ?? {}, body)

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: { settings: nextSettings } }
  )

  return NextResponse.json({
    success: true,
    data: nextSettings,
  })
}
