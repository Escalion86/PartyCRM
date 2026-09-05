import { getPartyReportModel, getPartyReportRevisionModel, getPartyReportMediaModel } from '@server/partyReportModels'
import { withReportContext, reportJson, reportId, loadReportOrder, isAssignedToReportOrder, isReportManager, visibleReport, latestReportTemplates, requireReportAuthorAssignment, reportTemplateApplicability } from '@server/partyReportAccess'
import { reportFailure, reportMediaIds, reportStatusFromAnswers, updateReportAnswers } from '@server/partyReportCore'
import { getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'

export const dynamic = 'force-dynamic'

const withStaffNames = async (tenantId, reports) => {
  if (!reports.length) return reports
  const Staff = await getPartyStaffModel()
  const people = await Staff.find({
    tenantId,
    _id: { $in: [...new Set(reports.map((report) => String(report.staffId)))] },
  }).select('firstName secondName').lean()
  const names = new Map(people.map((person) => [
    String(person._id),
    [person.firstName, person.secondName].filter(Boolean).join(' '),
  ]))
  return reports.map((report) => ({ ...report, staffName: names.get(String(report.staffId)) || 'Исполнитель' }))
}

export const GET = withReportContext(async (req, context) => {
  const query = new URL(req.url).searchParams
  const Reports = await getPartyReportModel()
  if (!query.get('orderId')) {
    const parsedLimit = Number(query.get('limit') || 30)
    const limit = Math.min(50, Math.max(1, Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 30))
    const filter = { tenantId: context.tenantId, 'templateSnapshot.fields.reviewerStaffId': context.staff._id }
    if (query.get('cursor')) filter._id = { $lt: reportId(query.get('cursor')) }
    // Developer synthetic staff IDs cannot be assigned as field reviewers.
    if (!/^[a-f\d]{24}$/i.test(String(context.staff._id))) return reportJson({ reports: [], templates: [], nextCursor: null })
    const found = await Reports.find(filter).sort({ _id: -1 }).limit(limit + 1).lean()
    const page = found.slice(0, limit)
    const Orders = await getPartyOrderModel()
    const orders = await Orders.find({ tenantId: context.tenantId, _id: { $in: page.map((report) => report.orderId) } }).select('title serviceTitle eventDate assignedStaff.staffId status').lean()
    const reports = page.flatMap((report) => {
      const order = orders.find((item) => String(item._id) === String(report.orderId))
      if (!order) return []
      const visible = visibleReport(context, report, order)
      return visible ? [{ ...visible, orderTitle: order.title || order.serviceTitle || 'Мероприятие', orderDate: order.eventDate }] : []
    })
    return reportJson({ reports: await withStaffNames(context.tenantId, reports), templates: [], nextCursor: found.length > limit ? String(page.at(-1)._id) : null })
  }
  const order = await loadReportOrder(context.tenantId, query.get('orderId'))
  const staffId = query.get('staffId')
  const stage = query.get('stage')
  const filter = { tenantId: context.tenantId, orderId: order._id }
  if (staffId) filter.staffId = reportId(staffId)
  if (stage) {
    if (!['before', 'after'].includes(stage)) reportFailure('Некорректный этап')
    filter.stage = stage
  }
  const found = await Reports.find(filter).sort({ createdAt: -1 }).lean()
  const reports = found.map((report) => visibleReport(context, report, order)).filter(Boolean)
  const assigned = isAssignedToReportOrder(context, order)
  const isReviewer = found.some((report) => report.templateSnapshot.fields.some((field) => String(field.reviewerStaffId || '') === String(context.staff._id)))
  // A shared field is readable through the library, not a grant to the report metadata.
  if (!isReportManager(context) && !assigned && !isReviewer) reportFailure('Нет доступа к отчётам заказа', 403)
  const templates = isReportManager(context) || assigned
    ? await reportTemplateApplicability(context.tenantId, order, (await latestReportTemplates(context.tenantId)).filter((template) => template.active && (!stage || template.stage === stage)))
    : []
  const definition = query.get('templateId') ? templates.find((template) => String(template._id) === query.get('templateId')) || null : null
  return reportJson({ reports: await withStaffNames(context.tenantId, reports), templates, definition })
})

export const POST = withReportContext(async (req, context) => {
  const body = await req.json()
  const order = await loadReportOrder(context.tenantId, body.orderId)
  const staffId = reportId(body.staffId)
  requireReportAuthorAssignment(context, order, staffId)
  const template = (await latestReportTemplates(context.tenantId)).find((item) => String(item._id) === reportId(body.templateId) && item.active)
  if (!template) reportFailure('Активная форма не найдена; обновите список', 404)
  const [applicableTemplate] = await reportTemplateApplicability(context.tenantId, order, [template])
  if (!applicableTemplate) reportFailure('В этой форме нет полей, применимых к заказу')
  const Reports = await getPartyReportModel()
  const report = await Reports.create({
    tenantId: context.tenantId, orderId: order._id, staffId,
    templateId: template._id, templateFamilyId: template.familyId,
    stage: template.stage,
    templateSnapshot: { title: template.title, stage: template.stage, version: template.version, fields: applicableTemplate.fields },
    answers: applicableTemplate.fields.map((field) => ({ fieldId: field.id, html: '', status: 'draft' })),
  })
  return reportJson((await withStaffNames(context.tenantId, [visibleReport(context, report.toObject(), order)]))[0])
})

export const PATCH = withReportContext(async (req, context) => {
  const body = await req.json()
  if (!Number.isInteger(body.revision) || body.revision < 0) reportFailure('Не указана версия отчёта')
  const Reports = await getPartyReportModel()
  const report = await Reports.findOne({ _id: reportId(body._id), tenantId: context.tenantId }).lean()
  if (!report) reportFailure('Отчёт не найден', 404)
  const order = await loadReportOrder(context.tenantId, String(report.orderId))
  if (!visibleReport(context, report, order)) reportFailure('Нет доступа к отчёту', 403)
  if (body.action !== 'review') requireReportAuthorAssignment(context, order, report.staffId)
  if (body.revision !== report.revision) reportFailure('Отчёт изменён в другом окне. Обновите его.', 409)
  const answers = updateReportAnswers({ report, context, action: body.action, answers: body.answers, fieldId: body.fieldId, decision: body.decision, comment: body.comment, eventDate: order.eventDate })
  const Media = await getPartyReportMediaModel()
  for (const answer of answers) {
    const ids = [...new Set(reportMediaIds(answer.html))]
    if (!ids.length) continue
    const count = await Media.countDocuments({ _id: { $in: ids }, tenantId: context.tenantId, reportId: report._id, fieldId: answer.fieldId })
    if (count !== ids.length) reportFailure('Фотография не относится к этому полю отчёта')
  }
  const now = new Date()
  // Archive the current immutable revision before a compare-and-swap update.
  // Concurrent writers archive the identical previous state only once.
  const Revisions = await getPartyReportRevisionModel()
  await Revisions.updateOne({ tenantId: context.tenantId, reportId: report._id, revision: report.revision }, {
    $setOnInsert: { snapshot: report },
  }, { upsert: true })
  const updated = await Reports.findOneAndUpdate({ _id: report._id, tenantId: context.tenantId, revision: body.revision }, {
    $set: { answers, status: reportStatusFromAnswers(answers), ...(body.action === 'submit' ? { submittedAt: now } : {}) },
    $inc: { revision: 1 },
  }, { new: true, runValidators: true }).lean()
  if (!updated) reportFailure('Отчёт изменён в другом окне. Обновите его.', 409)
  return reportJson((await withStaffNames(context.tenantId, [visibleReport(context, updated, order)]))[0])
})
