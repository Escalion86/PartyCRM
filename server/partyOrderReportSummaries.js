import { getPartyReportModel } from './partyReportModels'
import { loadPartyReportAuthorContexts } from './partyReportAuthorAccess'
import {
  canReadReportField,
  effectivePartyReportFields,
  hasPartyReportPermission,
  isAssignedReportStaff,
  isReportCoordinator,
  isTeamReport,
  reportStatusFromAnswers,
} from './partyReportCore'

// Badges describe started reports. Their status must not reveal answers from a
// hidden section, nor keep work due after its author loses that section.
export const withPartyOrderReportSummaries = async ({ context, orders }) => {
  const readableOrders = orders.filter(
    (order) =>
      hasPartyReportPermission(context, 'orders', 'read', order) &&
      hasPartyReportPermission(context, 'reports', 'read', order)
  )
  const summaries = new Map(
    readableOrders.map((order) => [
      String(order._id),
      { waiting: 0, submitted: 0, revision: 0 },
    ])
  )
  if (readableOrders.length) {
    const Reports = await getPartyReportModel()
    const reports = await Reports.find({
      tenantId: context.tenantId,
      orderId: { $in: readableOrders.map((order) => order._id) },
    })
      .select(
        'tenantId orderId staffId scope templateSnapshot.fields answers.fieldId answers.status'
      )
      .lean()
    const authorContexts = await loadPartyReportAuthorContexts(
      context.tenantId,
      reports.map((report) => report.staffId)
    )
    const orderMap = new Map(
      readableOrders.map((order) => [String(order._id), order])
    )
    for (const report of reports) {
      const order = orderMap.get(String(report.orderId))
      if (
        !order ||
        String(report.tenantId) !== String(context.tenantId) ||
        order.status === 'canceled'
      )
        continue
      const author = authorContexts.get(String(report.staffId))
      if (
        !author ||
        !isAssignedReportStaff(author, order) ||
        (isTeamReport(report) && !isReportCoordinator(author, order))
      )
        continue
      const fields = effectivePartyReportFields(
        { ...author, company: context.company },
        report,
        order,
        'edit'
      ).filter((field) =>
        canReadReportField(
          context,
          report,
          field,
          isAssignedReportStaff(context, order),
          order
        )
      )
      if (!fields.length) continue
      const status = reportStatusFromAnswers(
        fields.map(
          (field) =>
            report.answers?.find((answer) => answer.fieldId === field.id) || {
              status: 'draft',
            }
        )
      )
      const key = {
        draft: 'waiting',
        submitted: 'submitted',
        revision_requested: 'revision',
      }[status]
      if (key) summaries.get(String(order._id))[key] += 1
    }
  }
  return orders.map((order) => {
    const { reportSummary: _oldSummary, ...safe } = order
    const summary = summaries.get(String(order._id))
    return summary ? { ...safe, reportSummary: summary } : safe
  })
}
