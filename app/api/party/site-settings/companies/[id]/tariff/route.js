import { NextResponse } from 'next/server'
import { buildPartyCompanyTariffAdminPatch } from '@helpers/partySiteSettingsViewModel'
import {
  getPartyCompanyModel,
  getPartyTariffModel,
} from '@server/partyModels'
import { isValidObjectId } from '@server/partyApi'
import { getPartySiteSettingsDevUser } from '@server/partySiteSettingsAccess'

export const PATCH = async (req, { params }) => {
  const { error } = await getPartySiteSettingsDevUser()
  if (error) return error

  const { id } = await params
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { success: false, error: 'Некорректный id компании' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const patch = buildPartyCompanyTariffAdminPatch(body)
  const PartyCompanies = await getPartyCompanyModel()
  const PartyTariffs = await getPartyTariffModel()

  if (patch.tariffId) {
    if (!isValidObjectId(patch.tariffId)) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id тарифа' },
        { status: 400 }
      )
    }
    const tariffExists = await PartyTariffs.exists({ _id: patch.tariffId })
    if (!tariffExists) {
      return NextResponse.json(
        { success: false, error: 'Тариф не найден' },
        { status: 404 }
      )
    }
  }

  const company = await PartyCompanies.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true }
  ).lean()

  if (!company) {
    return NextResponse.json(
      { success: false, error: 'Компания не найдена' },
      { status: 404 }
    )
  }

  const tariff = company.tariffId
    ? await PartyTariffs.findById(company.tariffId)
        .select('title price hidden')
        .lean()
    : null

  return NextResponse.json(
    { success: true, data: { ...company, tariff } },
    { status: 200 }
  )
}

export const dynamic = 'force-dynamic'
