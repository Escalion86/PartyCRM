import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import {
  getAddressPoolSignature,
  normalizeAddressPoolString,
  normalizePartyPoolAddress,
} from '@helpers/addressPool'

const uniqueBy = (items, getKey) => {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

const normalizeSettingsPatch = (body) => {
  const patch = {}

  if (Array.isArray(body?.towns)) {
    patch.towns = uniqueBy(
      body.towns
        .map((item) => normalizeAddressPoolString(item))
        .filter(Boolean),
      (item) => item.toLowerCase()
    )
  }

  if (Array.isArray(body?.addresses)) {
    patch.addresses = uniqueBy(
      body.addresses
        .map(normalizePartyPoolAddress)
        .filter(
          (item) => item.town || item.street || item.house || item.room || item.comment
        ),
      (item) =>
        getAddressPoolSignature(item, [
          'town',
          'street',
          'house',
          'room',
          'comment',
        ]).toLowerCase()
    )
  }

  return patch
}

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
    data: company?.settings ?? {},
  })
}

export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const patch = normalizeSettingsPatch(body)

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()
  const prevSettings = company?.settings ?? {}

  const nextSettings = {
    ...prevSettings,
    ...patch,
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: { settings: nextSettings } }
  )

  return NextResponse.json({
    success: true,
    data: nextSettings,
  })
}
