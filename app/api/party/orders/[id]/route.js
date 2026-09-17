import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { NextResponse } from 'next/server'
import { getPartySharedLocationOrderIds } from '@server/partyRelatedOrders'
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
    if (['draft', 'active'].includes(nextStatus)) {
      const conflicts = await findPartyOrderConflicts({
        PartyOrders,
        tenantId: context.tenantId,
        payload: { ...currentOrder, status: nextStatus },
        excludeOrderId: id,
        sharedLocationOrderIds: await getPartySharedLocationOrderIds({ tenantId: context.tenantId, orderId: id }),
      })
      if (hasPartyOrderConflicts(conflicts)) return partyError(409, 'partycrm_order_conflict', 'Найдены пересечения по точке или исполнителю', 'validation', { conflicts })
    }
    const order = await PartyOrders.findOneAndUpdate(
      { _id: id, tenantId: context.tenantId, ...getPartyOrderWriteGuard(currentOrder) },
      { $set: { status: nextStatus }, $inc: { commercialRevision: 1 } },
      { returnDocument: 'after' }
    ).lean()

    if (!order) return partyError(409, 'partycrm_order_revision_conflict', 'Заказ изменился. Обновите его перед изменением статуса.', 'conflict')

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
          assignedStaff: body.assignedStaff.map(item => ({
            ...(currentOrder.assignedStaff || []).find(previous => String(previous.staffId) === String(item.staffId)),
            ...item,
          })),
          previousAssignedStaff: currentOrder.assignedStaff,
        }),
      }
    : body
  const bodyWithBackwardCompatibleBrief = {
    // Contact-role updates must not reset unrelated order or financial fields.
    ...(['contactRoles', 'assignedStaff'].some((field) => Object.prototype.hasOwnProperty.call(body || {}, field)) ? currentOrder : {}),
    ...bodyWithPreservedAssignmentStatuses,
    contactRoles: Object.prototype.hasOwnProperty.call(body || {}, 'contactRoles')
      ? body.contactRoles
      : currentOrder.contactRoles,
    eventBrief: Object.prototype.hasOwnProperty.call(body || {}, 'eventBrief')
      ? body?.eventBrief
      : currentOrder.eventBrief,
    orderItems: Object.prototype.hasOwnProperty.call(body || {}, 'orderItems')
      ? body?.orderItems
      : currentOrder.orderItems,
    // These fields are server-owned and can only change through apply-to-order.
    agreedProposal: currentOrder.agreedProposal,
    commercialRevision: currentOrder.commercialRevision,
  }
  const payload = normalizeOrderPayload(bodyWithBackwardCompatibleBrief)
  // Assignment forms cannot overwrite server-owned reports/calendar linkage.
  if (Array.isArray(payload.assignedStaff)) {
    const previousById = new Map((currentOrder.assignedStaff || []).map(item => [String(item.staffId), item]))
    payload.assignedStaff = payload.assignedStaff.map(item => {
      const previous = previousById.get(String(item.staffId))
      if (!previous) return item
      const preserved = {}
      for (const key of ['report', 'performerGoogleCalendarEventId', 'performerGoogleCalendarCalendarId', 'performerCalendarSyncedAt', 'performerCalendarSyncError']) {
        if (Object.prototype.hasOwnProperty.call(previous, key)) preserved[key] = previous[key]
      }
      return { ...item, ...preserved }
    })
  }
  // A stale editor must never resurrect the embedded ledger after migration.
  if (currentOrder.legacyLedgerMigrationId) payload.transactions = []
  const touchesCommercialFields = [
    'servicesIds',
    'serviceTitle',
    'contractAmount',
    'clientPayment',
    'orderItems',
  ].some((field) => Object.prototype.hasOwnProperty.call(body || {}, field))
  const currentCommercialRevision = Number(currentOrder.commercialRevision || 0)
  if (
    currentCommercialRevision > 0 &&
    (touchesCommercialFields || Object.prototype.hasOwnProperty.call(body || {}, 'assignedStaff')) &&
    Number(body?.commercialRevision) !== currentCommercialRevision
  ) {
    return partyError(
      409,
      'partycrm_order_revision_conflict',
      'Коммерческие условия заказа уже изменились. Обновите заказ.',
      'conflict'
    )
  }
  const ids = (value) =>
    (Array.isArray(value) ? value : []).map(String).sort().join(',')
  const servicesOrAmountChanged =
    ids(payload.servicesIds) !== ids(currentOrder.servicesIds) ||
    Number(payload.contractAmount || 0) !== Number(currentOrder.contractAmount || 0)
  const orderItemsChanged =
    JSON.stringify(payload.orderItems || []) !==
    JSON.stringify(currentOrder.orderItems || [])
  const commercialChanged =
    touchesCommercialFields && (servicesOrAmountChanged || orderItemsChanged)
  if (commercialChanged) {
    if (servicesOrAmountChanged && !orderItemsChanged) payload.orderItems = []
    payload.agreedProposal = {}
    payload.commercialRevision = currentCommercialRevision + 1
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, 'assignedStaff') &&
      JSON.stringify(payload.assignedStaff || []) !== JSON.stringify(currentOrder.assignedStaff || [])) {
    payload.commercialRevision = currentCommercialRevision + 1
  }

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
    payload.orderItems.length === 0 &&
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
    orderId: id,
  })
  if (referenceError) return referenceError
  if (nextStatus === 'closed') {
    const PartyTransactions = await getPartyTransactionModel()
    const transactions = await PartyTransactions.find({ tenantId: context.tenantId, orderId: id }).lean()
    const readiness = getPartyOrderCloseReadiness({
      order: { ...currentOrder, ...payload },
      transactions: transactions.length ? transactions : payload.transactions,
    })
    if (!readiness.ok) return partyError(409, 'partycrm_order_close_blocked', 'Заказ нельзя закрыть: есть незавершенные финансовые или рабочие пункты', 'validation', { blockers: readiness.blockers })
  }
  if (payload.status !== currentOrder.status) {
    payload.commercialRevision = currentCommercialRevision + 1
  }
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
    sharedLocationOrderIds: await getPartySharedLocationOrderIds({ tenantId: context.tenantId, orderId: id }),
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

  const revisionFilter = getPartyOrderWriteGuard(currentOrder)
  const order = await PartyOrders.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId, ...revisionFilter },
    { $set: limitedPayload },
    { returnDocument: 'after' }
  ).lean()

  if (!order) {
    return partyError(
      409,
      'partycrm_order_revision_conflict',
      'Заказ уже изменился. Обновите его перед сохранением.',
      'conflict'
    )
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
    const PartyTransactions = await getPartyTransactionModel()
    const groupPaymentPart = await PartyTransactions.findOne({
      tenantId: context.tenantId,
      orderId: id,
      groupPaymentId: { $ne: null },
    }).select('_id').lean()
    if (groupPaymentPart) {
      return partyError(
        409,
        'partycrm_order_group_payment_readonly',
        'Заказ с частью общего платежа нельзя удалить безвозвратно. Можно отменить заказ.',
        'validation'
      )
    }
    // Полное удаление заказа из БД
    const order = await PartyOrders.findOneAndDelete({
      _id: id,
      tenantId: context.tenantId,
      ...getPartyOrderWriteGuard(currentOrder),
    }).lean()

    if (!order) {
      return partyError(409, 'partycrm_order_changed', 'Заказ изменился. Обновите страницу и повторите действие.', 'validation')
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
