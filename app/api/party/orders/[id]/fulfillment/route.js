import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { getPartyOrderModel } from '@server/partyModels'
import {
  canPartyAccess,
  filterPartyOrderForAccess,
} from '@helpers/partyRolePermissions'
import { recordPartyOrderAudit } from '@server/partyAuditLog'
import { parsePartyIsoDate } from '@helpers/partyIsoDate'

export async function POST(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  const { id } = await params
  if (!isValidObjectId(id))
    return partyError(
      400,
      'partycrm_invalid_order_id',
      'Некорректный заказ',
      'validation'
    )
  const body = await parseJsonBody(req)
  const expectedUpdatedAt = parsePartyIsoDate(body.expectedUpdatedAt)
  if (
    !['complete', 'undo'].includes(body.action) ||
    !expectedUpdatedAt ||
    (body.performedAt !== undefined && !parsePartyIsoDate(body.performedAt))
  )
    return partyError(
      400,
      'partycrm_fulfillment_invalid',
      'Проверьте действие и обновите заказ',
      'validation'
    )
  try {
    const Orders = await getPartyOrderModel()
    const previous = await Orders.findOne({
      _id: id,
      tenantId: context.tenantId,
    }).lean()
    if (
      !previous ||
      !canPartyAccess(context, { resource: 'orders', order: previous })
    )
      return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
    if (
      !canPartyAccess(context, {
        resource: 'orders.fulfillment',
        action: 'edit',
        order: previous,
      })
    )
      return partyError(
        403,
        'partycrm_fulfillment_forbidden',
        'Нет права отмечать проведение',
        'permission'
      )
    const now = new Date()
    let fulfillment
    if (body.action === 'undo') {
      if (!previous.fulfillment?.performedAt)
        return partyError(
          409,
          'partycrm_fulfillment_missing',
          'Отметка проведения уже отсутствует. Обновите заказ.',
          'conflict'
        )
      if (
        typeof body.reason !== 'string' ||
        !body.reason.trim() ||
        body.reason.length > 1000
      )
        return partyError(
          400,
          'partycrm_fulfillment_reason',
          'Укажите причину исправления отметки',
          'validation'
        )
      fulfillment = {
        performedAt: null,
        amountKopecks: 0,
        recordedAt: now,
        recordedByStaffId: context.staff._id,
      }
    } else {
      const plannedEnd = previous.dateEnd
        ? new Date(previous.dateEnd)
        : previous.eventDate
          ? new Date(
              +new Date(previous.eventDate) +
                (Number(previous.durationMinutes) || 60) * 60000
            )
          : null
      const date = new Date(body.performedAt || plannedEnd || now)
      if (
        previous.status === 'canceled' ||
        !Number.isFinite(+date) ||
        +date > +now ||
        (previous.eventDate && +date < +new Date(previous.eventDate)) ||
        (plannedEnd && +plannedEnd > +now)
      )
        return partyError(
          400,
          'partycrm_fulfillment_date',
          'Можно отметить только уже проведённое мероприятие',
          'validation'
        )
      if (previous.fulfillment?.performedAt)
        return partyError(
          409,
          'partycrm_fulfillment_exists',
          'Проведение уже отмечено. Обновите заказ.',
          'conflict'
        )
      const amountKopecks = Math.round(
        Number(previous.contractAmount || 0) * 100
      )
      if (!Number.isSafeInteger(amountKopecks) || amountKopecks < 0)
        return partyError(
          400,
          'partycrm_fulfillment_amount',
          'Проверьте сумму заказа',
          'validation'
        )
      fulfillment = {
        performedAt: date,
        amountKopecks,
        recordedAt: now,
        recordedByStaffId: context.staff._id,
      }
    }
    const order = await Orders.findOneAndUpdate(
      { _id: id, tenantId: context.tenantId, updatedAt: expectedUpdatedAt },
      { $set: { fulfillment }, $inc: { commercialRevision: 1 } },
      { returnDocument: 'after' }
    ).lean()
    if (!order)
      return partyError(
        409,
        'partycrm_order_revision_conflict',
        'Заказ изменился. Обновите его перед сохранением.',
        'conflict'
      )
    await recordPartyOrderAudit({
      context,
      order,
      previousOrder: previous,
      action: 'order_updated',
      summary:
        body.action === 'undo'
          ? 'Исправил отметку проведения'
          : 'Отметил проведение мероприятия',
      metadata: body.action === 'undo' ? { reason: body.reason.trim() } : {},
    })
    return NextResponse.json({
      success: true,
      data: filterPartyOrderForAccess(context, order),
    })
  } catch (failure) {
    return partyError(
      500,
      'partycrm_fulfillment_failed',
      'Не удалось записать отметку проведения'
    )
  }
}
