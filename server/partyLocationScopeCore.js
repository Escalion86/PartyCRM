const objectId = /^[a-f\d]{24}$/i
export const locationFailure = (message, status = 400) => {
  const error = new Error(message)
  error.status = status
  throw error
}
export const normalizeLocationScope = (value, { required = true } = {}) => {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((item) => !objectId.test(String(item)))
  )
    locationFailure('Выберите корректные площадки')
  const ids = [...new Set(value.map(String))]
  if (required && !ids.length)
    locationFailure('У владельца площадки должна быть хотя бы одна площадка')
  return ids
}
export const buildLocationOrderFilter = (context, extra = {}) => {
  if (context?.role !== 'location_owner')
    locationFailure('Нет доступа к кабинету площадок', 403)
  const ids = normalizeLocationScope(context.staff?.locationIds)
  return {
    $and: [{ tenantId: context.tenantId, locationId: { $in: ids } }, extra],
  }
}
export const parseLocationOrderQuery = (searchParams) => {
  const query = {}
  const locationId = searchParams.get('locationId')
  if (locationId) {
    if (!objectId.test(locationId)) locationFailure('Некорректная площадка')
    query.locationId = locationId
  }
  const status = searchParams.get('status')
  if (status) {
    if (!['draft', 'active', 'closed', 'canceled'].includes(status))
      locationFailure('Некорректный статус')
    query.status = status
  }
  for (const [param, operator] of [
    ['from', '$gte'],
    ['to', '$lte'],
  ]) {
    const value = searchParams.get(param)
    if (!value) continue
    const parsed = new Date(value)
    if (!Number.isFinite(parsed.getTime())) locationFailure('Некорректная дата')
    if (param === 'to' && /^\d{4}-\d{2}-\d{2}$/.test(value))
      parsed.setUTCHours(23, 59, 59, 999)
    query.eventDate = { ...query.eventDate, [operator]: parsed }
  }
  if (
    query.eventDate?.$gte &&
    query.eventDate?.$lte &&
    query.eventDate.$gte > query.eventDate.$lte
  )
    locationFailure('Начало периода позже окончания')
  return query
}
