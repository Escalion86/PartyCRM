import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyTariffModel,
} from '@server/partyModels'
import { getPartySiteSettingsDevUser } from '@server/partySiteSettingsAccess'

export const GET = async () => {
  const { error } = await getPartySiteSettingsDevUser()
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const PartyTariffs = await getPartyTariffModel()
  const companies = await PartyCompanies.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .lean()

  const tariffIds = [
    ...new Set(
      companies
        .map((company) => String(company?.tariffId || '').trim())
        .filter(Boolean)
    ),
  ]
  const tariffs = tariffIds.length
    ? await PartyTariffs.find({ _id: { $in: tariffIds } })
        .select('title price hidden')
        .lean()
    : []
  const tariffsById = new Map(
    tariffs.map((tariff) => [String(tariff._id), tariff])
  )

  const data = companies.map((company) => ({
    ...company,
    tariff: tariffsById.get(String(company.tariffId || '')) || null,
  }))

  return NextResponse.json({ success: true, data }, { status: 200 })
}

export const dynamic = 'force-dynamic'
