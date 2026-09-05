import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import {
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { normalizePartyPerformerReportPayload } from '@server/partyPerformerReports'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

export async function PATCH(req, { params }) {
  const { sessionUser, memberships } = await getPartyMembershipContext({ excludeLocationOwners: true })

  if (!sessionUser?._id) {
    return partyError(401, 'unauthorized', 'Не авторизован', 'auth')
  }

  const id = await getId(params)
  const body = await parseJsonBody(req)
  const staffId = String(body.staffId || '').trim()

  if (!isValidObjectId(id) || !isValidObjectId(staffId)) {
    return partyError(400, 'partycrm_invalid_report_target', 'Некорректный id')
  }

  const membership = memberships.find(
    (item) => String(item.staffId) === staffId && item.status !== 'archived'
  )
  if (!membership) {
    return partyError(
      403,
      'partycrm_performer_staff_access_denied',
      'Нет доступа к этой карточке исполнителя',
      'auth'
    )
  }

  const report = normalizePartyPerformerReportPayload(body)
  const PartyOrders = await getPartyOrderModel()
  const order = await PartyOrders.findOneAndUpdate(
    {
      _id: id,
      tenantId: membership.tenantId,
      status: { $ne: 'canceled' },
      'assignedStaff.staffId': staffId,
    },
    {
      $set: {
        'assignedStaff.$.report': report,
      },
    },
    { returnDocument: 'after' }
  ).lean()

  if (!order) {
    return partyError(
      404,
      'partycrm_performer_order_not_found',
      'Назначенный заказ не найден'
    )
  }

  const assignment = (order.assignedStaff ?? []).find(
    (item) => String(item.staffId) === staffId
  )

  await recordPartyOrderAudit({
    context: {
      tenantId: membership.tenantId,
      role: membership.role,
      staff: membership.staff,
      sessionUser,
    },
    order,
    action: 'performer_report_submitted',
    summary: 'Отправил отчет по заказу',
    changes: [],
    metadata: { staffId, reportStatus: report.status },
  })

  return NextResponse.json({
    success: true,
    data: {
      orderId: String(order._id),
      staffId,
      report: assignment?.report || report,
    },
  })
}
