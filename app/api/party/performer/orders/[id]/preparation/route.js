import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { buildPerformerPreparationView } from '@server/partyOrderPreparation'
import { recordPartyOrderAudit } from '@server/partyAuditLog'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '@helpers/partyRolePermissions'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { ensurePartyOrderTasks } from '@server/partyTasks'

const getId = async (params) => (await params)?.id
const resolveAccess = async (req, params) => {
  const { sessionUser, memberships } = await getPartyMembershipContext({
    excludeLocationOwners: true,
  })
  if (!sessionUser?._id)
    return { error: partyError(401, 'unauthorized', 'Не авторизован', 'auth') }
  const orderId = await getId(params)
  const staffId = new URL(req.url).searchParams.get('staffId') || ''
  if (!isValidObjectId(orderId) || !isValidObjectId(staffId))
    return {
      error: partyError(
        400,
        'partycrm_invalid_preparation_target',
        'Некорректный заказ или сотрудник'
      ),
    }
  const membership = memberships.find(
    (item) => String(item.staffId) === staffId && item.status === 'active'
  )
  if (!membership)
    return {
      error: partyError(
        403,
        'partycrm_performer_staff_access_denied',
        'Нет доступа к этой карточке сотрудника',
        'auth'
      ),
    }
  const context = { ...membership, sessionUser }
  if (
    !canPartyAccess(context, { resource: 'orders' }) ||
    !canPartyAccess(context, { resource: 'orders.preparation' })
  )
    return {
      error: partyError(
        403,
        'partycrm_preparation_access_denied',
        'Нет доступа к подготовке заказа',
        'permission'
      ),
    }
  return { sessionUser, membership, orderId, staffId, context }
}

const loadOrder = async (membership, orderId, staffId) => {
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({
    _id: orderId,
    tenantId: membership.tenantId,
    status: { $nin: ['canceled'] },
    $or: [
      { 'assignedStaff.staffId': staffId },
      { 'preparation.items.responsibleStaffId': staffId },
    ],
  })
    .select(
      '_id tenantId title status assignedStaff preparation locationId workflowStageId responsibleStaffId updatedAt commercialRevision sharedLocationRevision'
    )
    .lean()
  return { Orders, order }
}

export async function GET(req, { params }) {
  const access = await resolveAccess(req, params)
  if (access.error) return access.error
  const { order } = await loadOrder(
    access.membership,
    access.orderId,
    access.staffId
  )
  if (
    !order ||
    !canPartyAccess(access.context, { resource: 'orders', order }) ||
    !canPartyAccess(access.context, { resource: 'orders.preparation', order })
  )
    return partyError(
      404,
      'partycrm_performer_order_not_found',
      'Подготовка заказа не найдена'
    )
  try {
    await ensurePartyOrderTasks({ tenantId: access.membership.tenantId, order })
    return NextResponse.json({
      success: true,
      data: {
        ...buildPerformerPreparationView(order, access.staffId),
        tasksManaged: true,
        canViewTasks: canPartyAccess(access.context, {
          resource: 'tasks',
          order,
        }),
      },
    })
  } catch (cause) {
    return partyError(
      cause.status || 500,
      'partycrm_preparation_access_denied',
      cause.status ? cause.message : 'Не удалось загрузить подготовку заказа',
      cause.status ? 'permission' : 'server'
    )
  }
}

export async function PATCH(req, { params }) {
  const access = await resolveAccess(req, params)
  if (access.error) return access.error
  const body = await parseJsonBody(req)
  const allowed =
    body?.action === 'set_item_status'
      ? ['action', 'itemId', 'status']
      : body?.action === 'acknowledge_address'
        ? ['action']
        : []
  if (
    !allowed.length ||
    Object.keys(body || {}).some((key) => !allowed.includes(key))
  )
    return partyError(
      400,
      'partycrm_invalid_preparation_action',
      'Некорректное действие подготовки',
      'validation'
    )
  const { Orders, order: current } = await loadOrder(
    access.membership,
    access.orderId,
    access.staffId
  )
  if (
    !current ||
    ['closed', 'canceled'].includes(current.status) ||
    !canPartyAccess(access.context, { resource: 'orders', order: current }) ||
    !canPartyAccess(access.context, {
      resource: 'orders.preparation',
      order: current,
    })
  )
    return partyError(
      404,
      'partycrm_performer_order_not_found',
      'Активная подготовка заказа не найдена'
    )
  if (body.action === 'set_item_status')
    return partyError(
      409,
      'partycrm_preparation_tasks_managed',
      'Пункты подготовки изменяются в разделе «Задачи».',
      'conflict'
    )
  if (
    !canPartyAccess(access.context, {
      resource: 'orders.ownAssignment',
      action: 'edit',
      order: current,
    }) &&
    !canPartyAccess(access.context, {
      resource: 'orders.preparation',
      action: 'edit',
      order: current,
    })
  )
    return partyError(
      403,
      'partycrm_address_ack_denied',
      'Нет права подтвердить ознакомление с адресом',
      'permission'
    )
  let order
  let mutated = false
  const now = new Date()
  {
    const assigned = (current.assignedStaff || []).some(
      (item) => String(item.staffId) === access.staffId
    )
    if (
      !assigned ||
      !current.preparation?.addressChange?.before ||
      !current.preparation?.addressChange?.after
    )
      return partyError(
        403,
        'partycrm_address_ack_denied',
        'Подтверждение адреса недоступно',
        'permission'
      )
    order = await Orders.findOneAndUpdate(
      {
        _id: access.orderId,
        tenantId: access.membership.tenantId,
        status: { $nin: ['closed', 'canceled'] },
        'assignedStaff.staffId': access.staffId,
        'preparation.addressChange.acknowledgements.staffId': {
          $ne: access.staffId,
        },
        $and: [
          getPartyOrderWriteGuard(current),
          buildPartyOrderAccessFilter(access.context),
        ],
      },
      {
        $push: {
          'preparation.addressChange.acknowledgements': {
            staffId: access.staffId,
            acknowledgedAt: now,
          },
        },
        $set: {
          'preparation.updatedAt': now,
          'preparation.updatedByStaffId': access.staffId,
        },
        $inc: { 'preparation.revision': 1 },
      },
      { returnDocument: 'after' }
    )
      .select('_id title status assignedStaff preparation')
      .lean()
    if (
      !order &&
      !(current.preparation?.addressChange?.acknowledgements || []).some(
        (item) => String(item.staffId) === access.staffId
      )
    )
      return partyError(
        409,
        'partycrm_preparation_conflict',
        'Подготовка заказа изменилась. Обновите её перед подтверждением адреса.',
        'conflict'
      )
    if (!order) order = current
    else mutated = true
  }
  if (!order)
    return partyError(
      404,
      'partycrm_preparation_item_not_found',
      'Назначенный пункт подготовки не найден'
    )
  if (mutated)
    await recordPartyOrderAudit({
      context: {
        tenantId: access.membership.tenantId,
        role: access.membership.role,
        staff: access.membership.staff,
        sessionUser: access.sessionUser,
      },
      order,
      previousOrder: current,
      action:
        body.action === 'set_item_status'
          ? 'order_preparation_item_updated'
          : 'order_address_acknowledged',
      summary:
        body.action === 'set_item_status'
          ? 'Обновил свой пункт подготовки'
          : 'Подтвердил ознакомление с новым адресом',
      changes: [],
      metadata: {
        staffId: access.staffId,
        itemId: body.itemId || null,
        status: body.status || null,
      },
    })
  return NextResponse.json({
    success: true,
    data: {
      ...buildPerformerPreparationView(order, access.staffId),
      tasksManaged: true,
      canViewTasks: canPartyAccess(access.context, {
        resource: 'tasks',
        order,
      }),
    },
  })
}
