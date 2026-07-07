import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { normalizePartyPerformerReportReview } from '@server/partyPerformerReports'

const getParam = async (params, key) => {
  const resolved = await params
  return resolved?.[key]
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getParam(params, 'id')
  const staffId = await getParam(params, 'staffId')
  if (!isValidObjectId(id) || !isValidObjectId(staffId)) {
    return partyError(400, 'partycrm_invalid_report_target', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  const review = normalizePartyPerformerReportReview(body)
  const PartyOrders = await getPartyOrderModel()
  const order = await PartyOrders.findOneAndUpdate(
    {
      _id: id,
      tenantId: context.tenantId,
      'assignedStaff.staffId': staffId,
    },
    {
      $set: {
        'assignedStaff.$.report.status': review.status,
        'assignedStaff.$.report.reviewComment': review.reviewComment,
        'assignedStaff.$.report.reviewedAt': review.reviewedAt,
        'assignedStaff.$.report.reviewedByStaffId': context.staff?._id ?? null,
      },
    },
    { returnDocument: 'after' }
  ).lean()

  if (!order) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  const assignment = (order.assignedStaff ?? []).find(
    (item) => String(item.staffId) === String(staffId)
  )

  return NextResponse.json({
    success: true,
    data: {
      orderId: String(order._id),
      staffId: String(staffId),
      report: assignment?.report || null,
    },
  })
}
