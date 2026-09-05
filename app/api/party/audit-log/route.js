import { NextResponse } from 'next/server'
import { getPartyAuditLogModel } from '@server/partyModels'
import { getPartyRequestContext, isValidObjectId, partyError } from '@server/partyApi'

const MAX_LIMIT = 100

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { searchParams } = new URL(req.url)
  const orderId = String(searchParams.get('orderId') || '').trim()
  const actorStaffId = String(searchParams.get('actorStaffId') || '').trim()
  const action = String(searchParams.get('action') || '').trim()
  const before = String(searchParams.get('before') || '').trim()
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), MAX_LIMIT)

  if (orderId && !isValidObjectId(orderId)) {
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id заказа')
  }
  if (actorStaffId && !isValidObjectId(actorStaffId)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id сотрудника')
  }
  if (before && !isValidObjectId(before)) {
    return partyError(400, 'partycrm_invalid_audit_cursor', 'Некорректный курсор истории')
  }

  const query = { tenantId: context.tenantId, entityType: 'order' }
  if (orderId) query.entityId = orderId
  if (actorStaffId) query.actorStaffId = actorStaffId
  if (action) query.action = action
  if (before) {
    query._id = { $lt: before }
  }

  const PartyAuditLogs = await getPartyAuditLogModel()
  const items = await PartyAuditLogs.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
  const hasMore = items.length > limit
  const data = hasMore ? items.slice(0, limit) : items

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      hasMore,
      nextCursor: hasMore ? String(data[data.length - 1]?._id || '') : null,
    },
  })
}
