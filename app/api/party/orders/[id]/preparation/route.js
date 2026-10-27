import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { normalizePartyOrderPreparation } from '@server/partyOrderPreparation'
import {
  serializePartyOrderPreparation,
  arePartyPreparationItemsEqual,
} from '@helpers/partyOrderPreparation'
import { recordPartyOrderAudit } from '@server/partyAuditLog'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '@helpers/partyRolePermissions'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { ensurePartyOrderTasks } from '@server/partyTasks'

const getId = async (params) => (await params)?.id

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
    permissionAware: true,
  })
  if (error) return error
  if (
    !canPartyAccess(context, { resource: 'orders' }) ||
    !canPartyAccess(context, { resource: 'orders.preparation' })
  )
    return partyError(
      403,
      'partycrm_forbidden',
      'Нет доступа к подготовке заказа',
      'permission'
    )
  const id = await getId(params)
  if (!isValidObjectId(id))
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id')
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: id, tenantId: context.tenantId })
    .select(
      '_id tenantId title status assignedStaff responsibleStaffId locationId workflowStageId preparation updatedAt commercialRevision sharedLocationRevision'
    )
    .lean()
  if (
    !order ||
    !canPartyAccess(context, { resource: 'orders', order }) ||
    !canPartyAccess(context, { resource: 'orders.preparation', order })
  )
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  await ensurePartyOrderTasks({ tenantId: context.tenantId, order })
  return NextResponse.json({
    success: true,
    data: {
      orderId: String(order._id),
      preparation: serializePartyOrderPreparation(order),
      tasksManaged: true,
      canViewTasks: canPartyAccess(context, { resource: 'tasks' }),
    },
  })
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
    permissionAware: true,
  })
  if (error) return error
  if (
    !canPartyAccess(context, { resource: 'orders' }) ||
    !canPartyAccess(context, { resource: 'orders.preparation', action: 'edit' })
  )
    return partyError(
      403,
      'partycrm_forbidden',
      'Нет права изменять подготовку заказа',
      'permission'
    )
  const id = await getId(params)
  if (!isValidObjectId(id))
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id')
  const body = await parseJsonBody(req)
  if (
    !body ||
    Object.keys(body).some(
      (key) => !['expectedRevision', 'preparation'].includes(key)
    ) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0
  )
    return partyError(
      400,
      'partycrm_invalid_preparation',
      'Передайте preparation и актуальную expectedRevision',
      'validation'
    )
  const Orders = await getPartyOrderModel()
  const current = await Orders.findOne({ _id: id, tenantId: context.tenantId })
    .select(
      '_id tenantId title status assignedStaff responsibleStaffId locationId workflowStageId preparation updatedAt commercialRevision sharedLocationRevision'
    )
    .lean()
  if (
    !current ||
    !canPartyAccess(context, { resource: 'orders', order: current }) ||
    !canPartyAccess(context, {
      resource: 'orders.preparation',
      action: 'edit',
      order: current,
    })
  )
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  if (['closed', 'canceled'].includes(current.status))
    return partyError(
      409,
      'partycrm_order_readonly',
      'Закрытый или отменённый заказ нельзя редактировать',
      'validation'
    )
  if (
    !arePartyPreparationItemsEqual(
      current.preparation?.items,
      body.preparation?.items
    )
  )
    return partyError(
      409,
      'partycrm_preparation_tasks_managed',
      'Пункты подготовки изменяются в разделе «Задачи». Сверку с клиентом и сборку сохраняйте здесь.',
      'conflict'
    )
  if (Number(current.preparation?.revision || 0) !== body.expectedRevision)
    return partyError(
      409,
      'partycrm_preparation_conflict',
      'Подготовка уже изменена. Обновите данные.',
      'conflict'
    )
  try {
    await ensurePartyOrderTasks({ tenantId: context.tenantId, order: current })
    const preparation = await normalizePartyOrderPreparation({
      tenantId: context.tenantId,
      staffId: context.staff._id,
      current: current.preparation || {},
      input: body.preparation,
    })
    const revisionFilter =
      body.expectedRevision === 0
        ? {
            $or: [
              { 'preparation.revision': 0 },
              { 'preparation.revision': { $exists: false } },
            ],
          }
        : { 'preparation.revision': body.expectedRevision }
    const order = await Orders.findOneAndUpdate(
      {
        _id: id,
        tenantId: context.tenantId,
        status: { $nin: ['closed', 'canceled'] },
        $and: [
          getPartyOrderWriteGuard(current),
          revisionFilter,
          buildPartyOrderAccessFilter(context),
        ],
      },
      { $set: { preparation } },
      { returnDocument: 'after' }
    )
      .select('_id title assignedStaff preparation')
      .lean()
    if (!order)
      return partyError(
        409,
        'partycrm_preparation_conflict',
        'Подготовка уже изменена. Обновите данные.',
        'conflict'
      )
    await recordPartyOrderAudit({
      context,
      order,
      previousOrder: current,
      action: 'order_preparation_updated',
      summary: 'Обновил подготовку заказа',
      changes: [],
      metadata: { preparationRevision: preparation.revision },
    })
    return NextResponse.json({
      success: true,
      data: {
        orderId: String(order._id),
        preparation: serializePartyOrderPreparation(order),
        tasksManaged: true,
        canViewTasks: canPartyAccess(context, { resource: 'tasks' }),
      },
    })
  } catch (cause) {
    return partyError(
      cause.status || 500,
      'partycrm_invalid_preparation',
      cause.status ? cause.message : 'Не удалось сохранить подготовку',
      cause.status ? 'validation' : 'server'
    )
  }
}
