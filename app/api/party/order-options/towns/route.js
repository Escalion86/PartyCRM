import { NextResponse } from 'next/server'
import { normalizeAddressPoolString, normalizeTownList } from '@helpers/addressPool'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { getPartyRequestContext, parseJsonBody, partyError } from '@server/partyApi'
import { getPartyCompanyModel } from '@server/partyModels'

export const dynamic = 'force-dynamic'

const townCollator = new Intl.Collator('ru', { sensitivity: 'accent' })
const townKey = (town) => town.normalize().toLocaleLowerCase('ru')

const getTownOptions = (settings) => {
  const knownTowns = new Map()
  const towns = Array.isArray(settings?.towns) ? settings.towns : []
  const addresses = Array.isArray(settings?.addresses) ? settings.addresses : []
  for (const value of [...towns, settings?.defaultTown, ...addresses.map((address) => address?.town)]) {
    const town = normalizeAddressPoolString(value)
    if (!town) continue
    const key = townKey(town)
    if (!knownTowns.has(key)) knownTowns.set(key, town)
  }
  return normalizeTownList([...knownTowns.values()])
}

const getTownContext = async (req) => {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return { error }
  const can = (resource, action) => canPartyAccess(context, { resource, action })
  if ((!can('orders', 'create') && !can('orders', 'edit')) ||
      (!can('orders.clientAddress', 'edit') && !can('orders.customAddress', 'edit'))) {
    return { error: partyError(403, 'partycrm_order_towns_forbidden', 'Нет права редактировать адрес выезда', 'permission') }
  }
  return { context }
}

const respond = (data) => NextResponse.json({ success: true, data }, {
  headers: { 'Cache-Control': 'private, no-store' },
})

export async function GET(req) {
  const { context, error } = await getTownContext(req)
  if (error) return error
  return respond({ towns: getTownOptions(context.company.settings) })
}

export async function POST(req) {
  const { context, error } = await getTownContext(req)
  if (error) return error

  const body = await parseJsonBody(req)
  const requestedTown = normalizeAddressPoolString(body.town).normalize()
  if (!requestedTown || requestedTown.length > 120 || /[\u0000-\u001f\u007f]/u.test(requestedTown)) {
    return partyError(400, 'partycrm_invalid_order_town', 'Введите название города длиной до 120 символов', 'validation')
  }

  const knownTowns = getTownOptions(context.company.settings)
  const matchesRequestedTown = (town) => townCollator.compare(town, requestedTown) === 0
  const town = knownTowns.find(matchesRequestedTown) || requestedTown
  const townLiteral = { $literal: town }

  try {
    const Companies = await getPartyCompanyModel()
    const company = await Companies.findOneAndUpdate(
      { _id: context.tenantId, status: { $ne: 'archived' } },
      [{ $set: { 'settings.towns': {
        $let: {
          vars: { towns: { $cond: [{ $isArray: '$settings.towns' }, '$settings.towns', []] } },
          in: { $cond: [
            { $in: [townLiteral, { $map: {
              input: '$$towns',
              as: 'town',
              in: { $cond: [{ $eq: [{ $type: '$$town' }, 'string'] }, { $trim: { input: '$$town' } }, null] },
            } }] },
            '$$towns',
            { $concatArrays: ['$$towns', [townLiteral]] },
          ] },
        },
      } } }],
      {
        updatePipeline: true,
        collation: { locale: 'ru', strength: 2 },
        returnDocument: 'after',
        projection: { 'settings.towns': 1, 'settings.defaultTown': 1, 'settings.addresses.town': 1 },
      }
    ).lean()
    if (!company) return partyError(404, 'partycrm_company_not_found', 'Компания не найдена')

    const towns = getTownOptions(company.settings)
    return respond({ towns, town: towns.find(matchesRequestedTown) || town })
  } catch {
    return partyError(500, 'partycrm_order_town_save_failed', 'Не удалось добавить город')
  }
}
