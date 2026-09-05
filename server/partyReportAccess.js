import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { getPartyOrderModel, getPartyStaffModel, getPartyServiceModel, getPartyLocationModel } from './partyModels'
import { getPartyRequestContext, partyError } from './partyApi'
import { canReadReportField, canReviewReportField, isReportAuthor, isReportManager, reportFailure } from './partyReportCore'
import { getPartyReportTemplateModel } from './partyReportModels'
import { isPartyReportFieldApplicable } from '@helpers/partyReportTemplates'

export const reportId = (value) => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) reportFailure('Некорректный идентификатор')
  return value
}

export const withReportContext = (handler, managementOnly = false) => async (req, params) => {
  try {
    const { context, error } = await getPartyRequestContext({ req, managementOnly })
    if (error) return error
    return await handler(req, context, params)
  } catch (error) {
    if (error instanceof SyntaxError) return partyError(400, 'partycrm_invalid_json', 'Некорректное тело запроса')
    if (error.code === 11000) return partyError(409, 'partycrm_report_conflict', 'Данные уже изменились. Обновите страницу.')
    return partyError(error.status || 500, error.status ? error.code : 'partycrm_report_failed', error.status ? error.message : 'Не удалось обработать отчёт')
  }
}

export const reportJson = (data) => NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })

export const loadReportOrder = async (tenantId, id) => {
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: reportId(id), tenantId }).lean()
  if (!order) reportFailure('Заказ не найден', 404)
  return order
}

export const isAssignedToReportOrder = (context, order) => (order.assignedStaff || []).some((item) => String(item.staffId) === String(context.staff._id))

export const requireReportAuthorAssignment = (context, order, staffId) => {
  if (String(context.staff._id) !== String(staffId) || !(order.assignedStaff || []).some((item) => String(item.staffId) === String(staffId))) reportFailure('Нет назначения на этот заказ', 403)
  if (order.status === 'canceled') reportFailure('Заказ отменён', 409)
}

export const visibleReport = (context, report, order) => {
  const fields = report.templateSnapshot.fields.filter((field) => canReadReportField(context, report, field, isAssignedToReportOrder(context, order)))
  if (!fields.length) return null
  const ids = new Set(fields.map((field) => field.id))
  // Do not leak hidden finance data through history, other answer fields or snapshot.
  const { history: _history, ...safe } = report
  return { ...safe, canEdit: isReportAuthor(context, report) && isAssignedToReportOrder(context, order) && order.status !== 'canceled', templateSnapshot: { ...report.templateSnapshot, fields: fields.map((field) => ({ ...field, canReview: canReviewReportField(context, field) })) }, answers: report.answers.filter((answer) => ids.has(answer.fieldId)) }
}

export const latestReportTemplates = async (tenantId) => {
  const Templates = await getPartyReportTemplateModel()
  return Templates.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)) } },
    { $sort: { version: -1 } },
    { $group: { _id: '$familyId', template: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$template' } },
    { $sort: { title: 1 } },
  ])
}

export const reportTemplateApplicability = async (tenantId, order, templates) => {
  let reservationRows = []
  let reservationActive = false
  if (templates.some((template) => template.fields.some((field) => field.applyWhenBound && field.resourceId))) {
    const { getPartyInventoryReservationModel } = await import('./partyInventoryModels')
    const Reservations = await getPartyInventoryReservationModel()
    const reservation = await Reservations.findOne({ tenantId, orderId: order._id }).select('rows status').lean()
    reservationActive = reservation?.status === 'active'
    // A removed service must not make its old equipment applicable again.
    reservationRows = (reservation?.rows || []).filter((row) =>
      (order.servicesIds || []).some((serviceId) => String(serviceId) === String(row.serviceId))
    )
  }
  return templates.map((template) => ({
    ...template,
    fields: template.fields.filter((field) => isPartyReportFieldApplicable(field, {
      serviceIds: order.servicesIds || [], locationId: order.locationId,
      // Completed events retain their historical kit; preparation needs an active reserve.
      reservationRows: reservationActive || template.stage === 'after' ? reservationRows : [],
    })),
  })).filter((template) => template.fields.length > 0)
}

export const validateReportFields = async (tenantId, input) => {
  if (!Array.isArray(input) || !input.length || input.length > 60) reportFailure('Форма должна содержать от 1 до 60 полей')
  const ids = new Set()
  const fields = input.map((field) => {
    if (!field || typeof field.id !== 'string' || !/^[\w-]{1,80}$/.test(field.id) || ids.has(field.id)) reportFailure('Идентификаторы полей должны быть уникальными')
    ids.add(field.id)
    const label = String(field.label || '').trim()
    const instruction = String(field.instruction || '').trim()
    if (!label || label.length > 240 || instruction.length > 4000) reportFailure('Некорректное название или подсказка поля')
    const section = field.section || 'general'
    if (!['general', 'creative', 'inventory', 'finance'].includes(section)) reportFailure('Некорректный раздел')
    const reconciliationValueType = String(field.reconciliationValueType || '')
    const reconciliationKey = String(field.reconciliationKey || '').trim()
    if (reconciliationValueType && section !== 'finance') reportFailure('Структурированное финансовое значение доступно только в финансовом разделе')
    if (reconciliationValueType && !['money', 'date', 'payment_method', 'text'].includes(reconciliationValueType)) reportFailure('Некорректный тип финансового значения')
    if (reconciliationValueType && !/^[a-z][a-z0-9_]{0,63}$/.test(reconciliationKey)) reportFailure('Ключ финансового значения должен быть в формате snake_case')
    if (!reconciliationValueType && (reconciliationKey || field.reconciliationRequired)) reportFailure('Для финансовой связи выберите тип значения')
    const result = { id: field.id, label, instruction, section, required: field.required === true, requiredMedia: field.requiredMedia === true, allowNotApplicable: field.allowNotApplicable === true, applyWhenBound: field.applyWhenBound === true, shareCreative: section === 'creative' && field.shareCreative === true, reconciliationKey: reconciliationValueType ? reconciliationKey : '', reconciliationValueType, reconciliationRequired: Boolean(reconciliationValueType && field.reconciliationRequired === true) }
    for (const key of ['reviewerStaffId', 'resourceId', 'serviceId', 'locationId']) result[key] = field[key] ? reportId(field[key]) : null
    if (result.applyWhenBound && !result.resourceId && !result.serviceId && !result.locationId) reportFailure('Для условия поля выберите услугу, площадку или реквизит')
    return result
  })
  const reconciliationKeys = fields.map((field) => field.reconciliationKey).filter(Boolean)
  if (new Set(reconciliationKeys).size !== reconciliationKeys.length) reportFailure('Ключи финансовых значений должны быть уникальными в форме')
  const getters = { reviewerStaffId: getPartyStaffModel, serviceId: getPartyServiceModel, locationId: getPartyLocationModel }
  if (fields.some((field) => field.resourceId)) {
    const { getPartyInventoryItemModel } = await import('./partyInventoryModels')
    getters.resourceId = getPartyInventoryItemModel
  }
  for (const [key, getter] of Object.entries(getters)) {
    const values = [...new Set(fields.map((field) => field[key]).filter(Boolean))]
    if (!values.length) continue
    const Model = await getter()
    const count = await Model.countDocuments({ tenantId, _id: { $in: values }, status: { $ne: 'archived' } })
    if (count !== values.length) reportFailure('Связанный сотрудник, услуга, реквизит или площадка не найдены в компании')
  }
  return fields
}

export { isReportManager }
