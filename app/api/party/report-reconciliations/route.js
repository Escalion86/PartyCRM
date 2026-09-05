import {
  getPartyReportModel,
  getPartyReportReconciliationModel,
  getPartyReportReconciliationRevisionModel,
} from '@server/partyReportModels'
import {
  loadReportOrder,
  reportId,
  reportJson,
  requireReportAuthorAssignment,
  withReportContext,
} from '@server/partyReportAccess'
import { reportFailure } from '@server/partyReportCore'
import {
  canAccessReportReconciliation,
  getReportReconciliationFields,
  reconciliationStatusFromValues,
  serializeReportReconciliation,
  updateReportReconciliation,
} from '@server/partyReportReconciliations'

export const dynamic = 'force-dynamic'

const loadReport = async (tenantId, id) => {
  const Reports = await getPartyReportModel()
  const report = await Reports.findOne({ _id: reportId(id), tenantId }).lean()
  if (!report) reportFailure('Отчёт не найден', 404)
  return report
}

export const GET = withReportContext(async (req, context) => {
  const report = await loadReport(
    context.tenantId,
    new URL(req.url).searchParams.get('reportId')
  )
  const order = await loadReportOrder(context.tenantId, String(report.orderId))
  if (!canAccessReportReconciliation({ context, report, order }))
    reportFailure('Нет доступа к финансовой сверке', 403)
  const Reconciliations = await getPartyReportReconciliationModel()
  const reconciliation = await Reconciliations.findOne({
    tenantId: context.tenantId,
    reportId: report._id,
  }).lean()
  if (!reconciliation) return reportJson(null)
  const data = serializeReportReconciliation({
    reconciliation,
    report,
    order,
    context,
  })
  if (!data) reportFailure('Нет доступа к финансовой сверке', 403)
  return reportJson(data)
})

export const POST = withReportContext(async (req, context) => {
  const body = await req.json()
  const report = await loadReport(context.tenantId, body.reportId)
  const order = await loadReportOrder(context.tenantId, String(report.orderId))
  requireReportAuthorAssignment(context, order, report.staffId)
  const fields = getReportReconciliationFields(report)
  if (!fields.length)
    reportFailure(
      'В этой версии отчёта нет структурированных финансовых значений'
    )
  const Reconciliations = await getPartyReportReconciliationModel()
  const existing = await Reconciliations.findOne({
    tenantId: context.tenantId,
    reportId: report._id,
  }).lean()
  if (existing)
    return reportJson(
      serializeReportReconciliation({
        reconciliation: existing,
        report,
        order,
        context,
      })
    )
  const reconciliation = await Reconciliations.create({
    tenantId: context.tenantId,
    reportId: report._id,
    orderId: report.orderId,
    staffId: report.staffId,
    reportTemplateVersion: report.templateSnapshot.version,
    fields,
    values: fields.map((field) => ({
      fieldId: field.fieldId,
      key: field.key,
      valueType: field.valueType,
      status: field.required ? 'draft' : 'not_required',
      hasValue: false,
    })),
  })
  return reportJson(
    serializeReportReconciliation({
      reconciliation: reconciliation.toObject(),
      report,
      order,
      context,
    })
  )
})

export const PATCH = withReportContext(async (req, context) => {
  const body = await req.json()
  if (!Number.isInteger(body.revision) || body.revision < 0)
    reportFailure('Не указана версия финансовой сверки')
  const Reconciliations = await getPartyReportReconciliationModel()
  const reconciliation = await Reconciliations.findOne({
    _id: reportId(body._id),
    tenantId: context.tenantId,
  }).lean()
  if (!reconciliation) reportFailure('Финансовая сверка не найдена', 404)
  const report = await loadReport(
    context.tenantId,
    String(reconciliation.reportId)
  )
  const order = await loadReportOrder(
    context.tenantId,
    String(reconciliation.orderId)
  )
  const visible = serializeReportReconciliation({
    reconciliation,
    report,
    order,
    context,
  })
  if (!visible) reportFailure('Нет доступа к финансовой сверке', 403)
  if (body.action !== 'review')
    requireReportAuthorAssignment(context, order, reconciliation.staffId)
  if (body.revision !== reconciliation.revision)
    reportFailure('Финансовая сверка изменена в другом окне. Обновите её.', 409)
  const values = updateReportReconciliation({
    reconciliation,
    context,
    action: body.action,
    values: body.values,
    fieldId: body.fieldId,
    decision: body.decision,
    comment: body.comment,
    eventDate: order.eventDate,
    reportStage: report.stage,
  })
  const now = new Date()
  const Revisions = await getPartyReportReconciliationRevisionModel()
  await Revisions.updateOne(
    {
      tenantId: context.tenantId,
      reconciliationId: reconciliation._id,
      revision: reconciliation.revision,
    },
    { $setOnInsert: { snapshot: reconciliation } },
    { upsert: true }
  )
  const updated = await Reconciliations.findOneAndUpdate(
    {
      _id: reconciliation._id,
      tenantId: context.tenantId,
      revision: body.revision,
    },
    {
      $set: {
        values,
        status:
          body.action === 'save'
            ? values.some((value) => value.status === 'revision_requested')
              ? 'revision_requested'
              : 'draft'
            : reconciliationStatusFromValues(values),
        ...(body.action === 'submit' ? { submittedAt: now } : {}),
      },
      $inc: { revision: 1 },
    },
    { new: true, runValidators: true }
  ).lean()
  if (!updated)
    reportFailure('Финансовая сверка изменена в другом окне. Обновите её.', 409)
  return reportJson(
    serializeReportReconciliation({
      reconciliation: updated,
      report,
      order,
      context,
    })
  )
})
