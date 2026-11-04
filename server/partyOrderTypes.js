import { getPartyOrderTypeModel, getPartyCompanyModel } from './partyModels'
import { partyBookingFailure } from '../helpers/partyOrderBooking.js'

export const normalizePartyOrderTypeTitle = (title) =>
  String(title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru')

// Only the explicit legacy dictionary is imported. Arbitrary order titles are not types.
export const ensurePartyOrderTypes = async (company) => {
  const Types = await getPartyOrderTypeModel()
  if (company.settings?.orderTypesMigrated === true) return Types
  const Companies = await getPartyCompanyModel()
  const persisted = await Companies.findOne({ _id: company._id })
    .select('settings.orderTypesMigrated')
    .lean()
  if (persisted?.settings?.orderTypesMigrated === true) return Types
  const titles = [
    ...new Set(
      (company.settings?.orderTypes || [])
        .map((value) => String(value?.title || value || '').trim())
        .filter(Boolean)
    ),
  ]
  if (titles.length) {
    await Types.init()
    for (const title of titles) {
      const normalizedTitle = normalizePartyOrderTypeTitle(title)
      try {
        await Types.updateOne(
          { tenantId: company._id, normalizedTitle },
          { $setOnInsert: { title, active: true, revision: 0 } },
          { upsert: true }
        )
      } catch (cause) {
        if (cause.code !== 11000) throw cause
      }
    }
  }
  await Companies.updateOne(
    { _id: company._id },
    { $set: { 'settings.orderTypesMigrated': true } }
  )
  return Types
}

export const getPartyOrderTypes = async (context, { all = false } = {}) => {
  const Types = await ensurePartyOrderTypes(context.company)
  return Types.find({
    tenantId: context.tenantId,
    ...(all ? {} : { active: true }),
  })
    .sort({ title: 1 })
    .lean()
}

export const validatePartyServiceBookingSettings = async (body, tenantId) => {
  const patch = {}
  for (const field of [
    'availabilityConfigured',
    'offsiteAllowed',
    'repeatable',
  ]) {
    if (body[field] === undefined) continue
    if (typeof body[field] !== 'boolean')
      partyBookingFailure(
        'Проверьте настройки доступности и повторности услуги'
      )
    patch[field] = body[field]
  }
  for (const field of ['maxQuantity', 'includedRentalMinutes']) {
    if (body[field] === undefined) continue
    if (field === 'maxQuantity' && body[field] === null) {
      patch[field] = null
      continue
    }
    const value = Number(body[field])
    if (
      !Number.isSafeInteger(value) ||
      value < (field === 'maxQuantity' ? 1 : 0) ||
      value > (field === 'maxQuantity' ? 100000 : 10080)
    )
      partyBookingFailure(
        'Проверьте максимальное количество и включённые минуты аренды'
      )
    patch[field] = value
  }
  for (const field of ['orderTypeIds', 'locationIds']) {
    if (body[field] === undefined) continue
    if (
      !Array.isArray(body[field]) ||
      body[field].length > 500 ||
      body[field].some(
        (value) => typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)
      )
    )
      partyBookingFailure('Выберите типы заказов и помещения из справочника')
    const values = [...new Set(body[field].map((value) => value.toLowerCase()))]
    const { getPartyLocationModel } = await import('./partyModels')
    const Model =
      field === 'orderTypeIds'
        ? await getPartyOrderTypeModel()
        : await getPartyLocationModel()
    if (
      values.length &&
      (await Model.countDocuments({ tenantId, _id: { $in: values } })) !==
        values.length
    )
      partyBookingFailure('Тип заказа или помещение не принадлежит компании')
    patch[field] = values
  }
  return patch
}
