import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import {
  filterCompanySettingsPatchByTariffAccess,
  mergeCompanySettingsPatch,
  normalizeCompanyProfile,
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
    .select({
      title: 1,
      legalTitle: 1,
      phone: 1,
      email: 1,
      settings: 1,
      tariffId: 1,
      trialEndsAt: 1,
    })
    .lean()
  const { serializedAccess } = await getPartyCompanyTariffAccessState(company)

  return NextResponse.json({
    success: true,
    data: {
      company: normalizeCompanyProfile(company ?? {}),
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
    .select({
      title: 1,
      legalTitle: 1,
      phone: 1,
      email: 1,
      settings: 1,
      tariffId: 1,
      trialEndsAt: 1,
    })
    .lean()
  const { access, serializedAccess } = await getPartyCompanyTariffAccessState(
    company
  )
  const { company: companyPatch = null, ...settingsPatch } = body
  const filteredBody = filterCompanySettingsPatchByTariffAccess(
    settingsPatch,
    access
  )
  const nextSettings = mergeCompanySettingsPatch(
    company?.settings ?? {},
    filteredBody
  )
  const nextCompany = normalizeCompanyProfile(companyPatch ?? {})
  const updateSet = { settings: nextSettings }
  const companySet = {}
  for (const key of ['title', 'legalTitle', 'phone', 'email']) {
    if (!Object.hasOwn(nextCompany, key) || !Object.hasOwn(companyPatch ?? {}, key)) {
      continue
    }
    if (key === 'title' && !nextCompany.title) continue
    companySet[key] = nextCompany[key]
    updateSet[key] = nextCompany[key]
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: updateSet }
  )

  return NextResponse.json({
    success: true,
    data: {
      company: normalizeCompanyProfile({
        ...company,
        ...companySet,
      }),
      settings: nextSettings,
      access: serializedAccess,
    },
  })
}
