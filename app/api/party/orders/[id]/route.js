import { NextResponse } from 'next/server'
import { syncPartyOrderInventory } from '@server/partyInventory'
import {
  getPartyOrderModel,
  getPartyTransactionModel,
} from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import {
  applyPartyAssignmentAccountDefaults,
  normalizeOrderPayload,
  validateOrderReferences,
} from '../route'
import { getPartyClientModel } from '@server/partyModels'
import {
  findPartyOrderConflicts,
  hasPartyOrderConflicts,
} from '@server/partyOrderConflicts'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { filterPartyOrderPayloadByTariffAccess } from '@helpers/partyTariffAccess'
import { getPartyOrderCloseReadiness } from '@helpers/partyOrderCloseReadiness'
import {
  deletePartyOrderCalendarEventsAfterCrud,
  syncPartyOrderCalendarAfterCrud,
} from '@server/partyOrderCalendarHooks'
import { sendPartyPerformerAssignmentPushes } from '@server/partyPerformerPush'
import { preservePartyAssignmentConfirmationStatuses } from '@helpers/partyOrderAssignments'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

const buildOrderClientSnapshot = async ({ tenantId, payload }) => {
  if (!payload.clientId) return payload

  const PartyClients = await getPartyClientModel()
  const client = await PartyClients.findOne({
    _id: payload.clientId,
    tenantId,
    status: { $ne: 'archived' },
  }).lean()

  if (!client) return payload

  return {
    ...payload,
    client: {
      name: [client.firstName, client.secondName, client.thirdName]
        .filter(Boolean)
        .join(' '),
      phone: client.phone || '',
      email: client.email || '',
    },
  }
}

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id')
  }

  const PartyOrders = await getPartyOrderModel()
  const order = await PartyOrders.findOne({
    _id: id,
    tenantId: context.tenantId,
  }).lean()

  if (!order) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  const orderWithAssignmentDefaults = await applyPartyAssignmentAccountDefaults({
    tenantId: context.tenantId,
    payload: order,
  })

  return NextResponse.json({ success: true, data: orderWithAssignmentDefaults })
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  const PartyOrders = await getPartyOrderModel()
  const currentOrder = await PartyOrders.findOne({
    _id: id,
    tenantId: context.tenantId,
  }).lean()

  if (!currentOrder) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  const isStatusOnlyPatch =
    Object.keys(body || {}).length === 1 && typeof body.status === 'string'
  const nextStatus = ['draft', 'active', 'canceled', 'closed'].includes(
    body.status
  )
    ? body.status
    : currentOrder.status

  if (currentOrder.status === 'closed') {
    return partyError(
      409,
      'partycrm_order_closed_readonly',
      'Закрытый заказ нельзя редактировать',
      'validation'
    )
  }

  if (nextStatus === 'closed' && currentOrder.status !== 'closed') {
    const PartyTransactions = await getPartyTransactionModel()
    const transactions = await PartyTransactions.find({
      tenantId: context.tenantId,
      orderId: id,
    }).lean()
    const readiness = getPartyOrderCloseReadiness({
      order: currentOrder,
      transactions:
        transactions.length > 0 ? transactions : currentOrder.transactions,
    })
    if (!readiness.ok) {
      return partyError(
        409,
        'partycrm_order_close_blocked',
        'Заказ нельзя закрыть: есть незавершенные финансовые или рабочие пункты',
        'validation',
        { blockers: readiness.blockers }
      )
    }
  }

  if (isStatusOnlyPatch) {
    const order = await PartyOrders.findOneAndUpdate(
      { _id: id, tenantId: context.tenantId },
      { $set: { status: nextStatus } },
      { returnDocument: 'after' }
    ).lean()

    const inventory = await syncPartyOrderInventory({
      tenantId: context.tenantId,
      order,
      staffId: context.staff?._id,
    })

    await recordPartyOrderAudit({
      context,
      order,
      previousOrder: currentOrder,
      action: 'order_status_changed',
      summary: 'Изменил статус заказа',
    })

    await syncPartyOrderCalendarAfterCrud({
      tenantId: context.tenantId,
      orderId: id,
      previousOrder: currentOrder,
    })

    return NextResponse.json({ success: true, data: order, inventory })
  }

  const bodyWithPreservedAssignmentStatuses = Array.isArray(body?.assignedStaff)
    ? {
        ...body,
        assignedStaff: preservePartyAssignmentConfirmationStatuses({
          assignedStaff: body.assignedStaff,
          previousAssignedStaff: currentOrder.assignedStaff,
        }),
      }
    : body
  const payload = normalizeOrderPayload(bodyWithPreservedAssignmentStatuses)

  // Валидация клиента и услуги — только если эти поля явно переданы в теле запроса
  // (при частичном обновлении, например только статуса, пропускаем проверку)
  const hasClientOrServiceFields =
    'clientId' in body ||
    'client' in body ||
    'servicesIds' in body ||
    'serviceTitle' in body

  if (
    hasClientOrServiceFields &&
    !payload.clientId &&
    !payload.client.name &&
    payload.servicesIds.length === 0 &&
    !payload.serviceTitle
  ) {
    return partyError(
      400,
      'partycrm_order_client_or_service_required',
      'Укажите клиента или услугу заказа',
      'validation'
    )
  }

  const referenceError = await validateOrderReferences({
    tenantId: context.tenantId,
    payload,
  })
  if (referenceError) return referenceError
  const payloadWithAssignmentDefaults = await applyPartyAssignmentAccountDefaults({
    tenantId: context.tenantId,
    payload,
  })
  const payloadWithClient = await buildOrderClientSnapshot({
    tenantId: context.tenantId,
    payload: payloadWithAssignmentDefaults,
  })
  const { access } = await getPartyCompanyTariffAccessState(context.company)
  const limitedPayload = filterPartyOrderPayloadByTariffAccess(
    payloadWithClient,
    access
  )

  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: context.tenantId,
    payload: limitedPayload,
    excludeOrderId: id,
  })
  if (hasPartyOrderConflicts(conflicts)) {
    return partyError(
      409,
      'partycrm_order_conflict',
      'Найдены пересечения по точке или исполнителю',
      'validation',
      { conflicts }
    )
  }

  const order = await PartyOrders.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: limitedPayload },
    { returnDocument: 'after' }
  ).lean()

  if (!order) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  await recordPartyOrderAudit({
    context,
    order,
    previousOrder: currentOrder,
    action: 'order_updated',
    summary: 'Изменил заказ',
  })

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: id,
    previousOrder: currentOrder,
  })

  await sendPartyPerformerAssignmentPushes({
    tenantId: context.tenantId,
    company: context.company,
    previousOrder: currentOrder,
    nextOrder: order,
    source: 'party-order-updated',
  })

  const inventory = await syncPartyOrderInventory({ tenantId: context.tenantId, order, staffId: context.staff?._id })
  return NextResponse.json({ success: true, data: order, inventory })
}

export async function DELETE(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id')
  }

  const { searchParams } = new URL(req.url)
  const permanent = searchParams.get('permanent') === 'true'

  const PartyOrders = await getPartyOrderModel()
  const currentOrder = await PartyOrders.findOne({
    _id: id,
    tenantId: context.tenantId,
  }).lean()

  if (!currentOrder) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  if (currentOrder.status === 'closed') {
    return partyError(
      409,
      'partycrm_order_closed_readonly',
      'Закрытый заказ нельзя удалить',
      'validation'
    )
  }

  if (permanent) {
    // Полное удаление заказа из БД
    const order = await PartyOrders.findOneAndDelete({
      _id: id,
      tenantId: context.tenantId,
    }).lean()

    if (!order) {
      return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
    }

    await recordPartyOrderAudit({
      context,
      previousOrder: order,
      orderId: id,
      action: 'order_deleted',
      summary: 'Удалил заказ без возможности восстановления',
      changes: [],
    })

    await deletePartyOrderCalendarEventsAfterCrud({
      tenantId: context.tenantId,
      orderSnapshot: order,
    })

    const inventory = await syncPartyOrderInventory({ tenantId: context.tenantId, order, deleted: true })
    return NextResponse.json({ success: true, data: order, inventory })
  }

  // По умолчанию — отмена заказа (мягкое удаление)
  const order = await PartyOrders.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: { status: 'canceled' } },
    { returnDocument: 'after' }
  ).lean()

  if (!order) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  await recordPartyOrderAudit({
    context,
    order,
    previousOrder: currentOrder,
    action: 'order_canceled',
    summary: 'Отменил заказ',
  })

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: id,
    previousOrder: currentOrder,
  })

  await sendPartyPerformerAssignmentPushes({
    tenantId: context.tenantId,
    company: context.company,
    previousOrder: currentOrder,
    nextOrder: order,
    source: 'party-order-canceled',
  })

  const inventory = await syncPartyOrderInventory({ tenantId: context.tenantId, order, staffId: context.staff?._id })
  return NextResponse.json({ success: true, data: order, inventory })
}
