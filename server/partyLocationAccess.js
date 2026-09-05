import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError, isValidObjectId } from './partyApi'
import { getPartyLocationModel, getPartyStaffModel } from './partyModels'
import {
  locationFailure,
  normalizeLocationScope,
  buildLocationOrderFilter,
} from './partyLocationScopeCore'

export { locationFailure, normalizeLocationScope, buildLocationOrderFilter }
export const scopedJson = (data) =>
  NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
export const requireLocationObjectId = (value) => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    locationFailure('Некорректный идентификатор')
  return value
}
export const validateStaffLocationScope = async (tenantId, value) => {
  const ids = normalizeLocationScope(value)
  const Locations = await getPartyLocationModel()
  const count = await Locations.countDocuments({ tenantId, _id: { $in: ids } })
  if (count !== ids.length)
    locationFailure('Выбранные площадки не принадлежат компании')
  return ids
}
export const withLocationContext = (handler) => async (req, args) => {
  try {
    const { context, error } = await getPartyRequestContext({
      req,
      allowLocationOwner: true,
    })
    if (error) return error
    if (context.role !== 'location_owner')
      locationFailure('Кабинет доступен только владельцу площадки', 403)
    if (!isValidObjectId(context.staff?._id))
      locationFailure('Нет доступа к площадкам', 403)
    await validateStaffLocationScope(
      context.tenantId,
      context.staff.locationIds
    )
    return await handler(req, context, args)
  } catch (error) {
    return partyError(
      error.status || 500,
      'partycrm_location_access_failed',
      error.status ? error.message : 'Не удалось обработать данные площадки'
    )
  }
}

// A real write locks this membership for the duration of the financial transaction.
// Revoking its scope concurrently then conflicts/retries instead of using stale rights.
export const lockLocationMembership = async (context, session) => {
  const Staff = await getPartyStaffModel()
  const staff = await Staff.findOneAndUpdate(
    {
      _id: context.staff._id,
      tenantId: context.tenantId,
      role: 'location_owner',
      status: 'active',
      locationIds: {
        $all: context.staff.locationIds,
        $size: context.staff.locationIds.length,
      },
    },
    { $inc: { locationScopeRevision: 1 } },
    { session, new: true }
  ).lean()
  if (!staff)
    locationFailure('Права доступа изменились. Обновите страницу.', 403)
}
