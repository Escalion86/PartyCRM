import { withPartyFinancialTransaction } from '@server/partyFinancialSettlements'
import {
  getPartyReportModel,
  getPartyReportRevisionModel,
  getPartyReportMediaModel,
} from '@server/partyReportModels'
import {
  withReportContext,
  reportJson,
  reportId,
  loadReportOrder,
  isAssignedToReportOrder,
  isReportManager,
  visibleReport,
  latestReportTemplates,
  requireReportAuthorAssignment,
  reportTemplateApplicability,
} from '@server/partyReportAccess'
import {
  reportFailure,
  reportAudience,
  isTeamReport,
  isReportAuthor,
  isReportCoordinator,
  canReviewReportField,
  hasPartyReportPermission,
  reportTeamStaffIds,
  reportMediaIds,
  reportStatusFromAnswers,
  updateReportAnswers,
} from '@server/partyReportCore'
import { getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import {
  normalizePartyReportPolicy,
  partyReportDueAt,
  partyReportAvailability,
} from '@helpers/partyReportPolicy'
import {
  loadPartyReportAuthorContexts,
  partyReportWithEffectiveStatus,
  filterPartyReportTemplatesForAuthor,
} from '@server/partyReportAuthorAccess'

export const dynamic = 'force-dynamic'

const withStaffNames = async (tenantId, reports) => {
  if (!reports.length) return reports
  const Staff = await getPartyStaffModel()
  const people = await Staff.find({
    tenantId,
    _id: {
      $in: [
        ...new Set(
          reports.flatMap((report) => [
            String(report.staffId),
            ...(report.teamStaffIds || []).map(String),
          ])
        ),
      ],
    },
  })
    .select('firstName secondName')
    .lean()
  const names = new Map(
    people.map((person) => [
      String(person._id),
      [person.firstName, person.secondName].filter(Boolean).join(' '),
    ])
  )
  return reports.map((report) => ({
    ...report,
    staffName: names.get(String(report.staffId)) || 'Исполнитель',
    teamStaffNames: (report.teamStaffIds || []).map((id) => ({
      _id: String(id),
      name: names.get(String(id)) || 'Исполнитель',
    })),
  }))
}

const withEffectiveStatuses = async (tenantId, reports, orders) => {
  if (!reports.length) return reports
  const contexts = await loadPartyReportAuthorContexts(
    tenantId,
    reports.map((report) => report.staffId)
  )
  return reports.map((report) =>
    partyReportWithEffectiveStatus(
      report,
      contexts.get(String(report.staffId)),
      orders.find((order) => String(order._id) === String(report.orderId))
    )
  )
}

export const GET = withReportContext(async (req, context) => {
  const query = new URL(req.url).searchParams
  const Reports = await getPartyReportModel()
  if (!query.get('orderId')) {
    const parsedLimit = Number(query.get('limit') || 30)
    const limit = Math.min(
      50,
      Math.max(1, Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 30)
    )
    const reviewerFilters = [
      { 'templateSnapshot.fields.reviewerStaffId': context.staff._id },
    ]
    const positionId =
      context.position?.active !== false &&
      (context.position?._id || context.staff.positionId)
    if (positionId)
      reviewerFilters.push({
        'templateSnapshot.fields.reviewerPositionId': positionId,
      })
    const filter = { tenantId: context.tenantId, $or: reviewerFilters }
    if (query.get('cursor')) filter._id = { $lt: reportId(query.get('cursor')) }
    // Developer synthetic staff IDs cannot be assigned as field reviewers.
    if (!/^[a-f\d]{24}$/i.test(String(context.staff._id)))
      return reportJson({ reports: [], templates: [], nextCursor: null })
    const found = await Reports.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean()
    const page = found.slice(0, limit)
    const Orders = await getPartyOrderModel()
    const orders = await Orders.find({
      tenantId: context.tenantId,
      _id: { $in: page.map((report) => report.orderId) },
    })
      .select(
        'tenantId title serviceTitle eventDate assignedStaff responsibleStaffId reportCoordinatorStaffId status workflowStageId locationId'
      )
      .lean()
    const effectivePage = await withEffectiveStatuses(
      context.tenantId,
      page,
      orders
    )
    const reports = effectivePage.flatMap((report) => {
      const order = orders.find(
        (item) => String(item._id) === String(report.orderId)
      )
      if (!order) return []
      const visible = visibleReport(context, report, order)
      return visible
        ? [
            {
              ...visible,
              orderTitle:
                (hasPartyReportPermission(
                  context,
                  'orders.title',
                  'read',
                  order
                ) &&
                  order.title) ||
                (hasPartyReportPermission(
                  context,
                  'orders.serviceTitle',
                  'read',
                  order
                ) &&
                  order.serviceTitle) ||
                'Мероприятие',
              orderDate: hasPartyReportPermission(
                context,
                'orders.eventDate',
                'read',
                order
              )
                ? order.eventDate
                : null,
            },
          ]
        : []
    })
    return reportJson({
      reports: await withStaffNames(context.tenantId, reports),
      templates: [],
      nextCursor: found.length > limit ? String(page.at(-1)._id) : null,
    })
  }
  const order = await loadReportOrder(context.tenantId, query.get('orderId'))
  if (!hasPartyReportPermission(context, 'reports', 'read', order))
    reportFailure('Нет доступа к отчётам этого заказа', 403)
  const staffId = query.get('staffId')
  const stage = query.get('stage')
  const filter = { tenantId: context.tenantId, orderId: order._id }
  if (staffId) filter.staffId = reportId(staffId)
  if (stage) {
    if (!['before', 'after'].includes(stage)) reportFailure('Некорректный этап')
    filter.stage = stage
  }
  const found = await Reports.find(filter).sort({ createdAt: -1 }).lean()
  const effective = await withEffectiveStatuses(context.tenantId, found, [
    order,
  ])
  const reports = effective
    .map((report) => visibleReport(context, report, order))
    .filter(Boolean)
  const assigned = isAssignedToReportOrder(context, order)
  const isReviewer = found.some((report) =>
    report.templateSnapshot.fields.some((field) =>
      canReviewReportField(context, field)
    )
  )
  // A shared field is readable through the library, not a grant to the report metadata.
  if (
    !isReportManager(context) &&
    !assigned &&
    !isReviewer &&
    !found.some(
      (report) => isTeamReport(report) && isReportAuthor(context, report)
    )
  )
    reportFailure('Нет доступа к отчётам заказа', 403)
  const configuredTemplates =
    isReportManager(context) || assigned
      ? await latestReportTemplates(context.tenantId)
      : []
  const activeTemplates = configuredTemplates.filter(
    (template) => template.active && (!stage || template.stage === stage)
  )
  const applicableTemplates = await reportTemplateApplicability(
    context.tenantId,
    order,
    activeTemplates
  )
  const templates = assigned
    ? filterPartyReportTemplatesForAuthor(applicableTemplates, context, order)
    : applicableTemplates
  const availability = partyReportAvailability({
    templates: configuredTemplates,
    activeTemplates,
    applicableTemplates,
    visibleTemplates: templates,
    order,
    assigned,
    coordinator: isReportCoordinator(context, order),
    manager: isReportManager(context),
  })
  const definition = query.get('templateId')
    ? templates.find(
        (template) => String(template._id) === query.get('templateId')
      ) || null
    : null
  return reportJson({
    reports: await withStaffNames(context.tenantId, reports),
    templates,
    definition,
    availability,
    currentStaffId: String(context.staff._id),
    canCreateIndividualReport: assigned && order.status !== 'canceled',
    canCreateTeamReport:
      isReportCoordinator(context, order) && order.status !== 'canceled',
  })
})

export const POST = withReportContext(async (req, context) => {
  const body = await req.json()
  const order = await loadReportOrder(context.tenantId, body.orderId)
  const staffId = reportId(body.staffId)
  requireReportAuthorAssignment(context, order, staffId)
  const template = (await latestReportTemplates(context.tenantId)).find(
    (item) => String(item._id) === reportId(body.templateId) && item.active
  )
  if (!template)
    reportFailure('Активная форма не найдена; обновите список', 404)
  const scope = reportAudience(template)
  const policy = normalizePartyReportPolicy(template)
  requireReportAuthorAssignment(context, order, staffId, scope)
  const applicableTemplates = await reportTemplateApplicability(
    context.tenantId,
    order,
    [template]
  )
  const [applicableTemplate] = filterPartyReportTemplatesForAuthor(
    applicableTemplates,
    context,
    order
  )
  if (!applicableTemplate)
    reportFailure('В этой форме нет полей, применимых к заказу')
  const Reports = await getPartyReportModel()
  const report = await Reports.create({
    tenantId: context.tenantId,
    orderId: order._id,
    staffId,
    templateId: template._id,
    templateFamilyId: template.familyId,
    stage: template.stage,
    scope,
    teamStaffIds: scope === 'team' ? reportTeamStaffIds(order) : [],
    templateSnapshot: {
      audience: scope,
      title: template.title,
      stage: template.stage,
      version: template.version,
      fields: applicableTemplate.fields,
      ...policy,
    },
    dueAt: partyReportDueAt(policy, order),
    answers: applicableTemplate.fields.map((field) => ({
      fieldId: field.id,
      html: '',
      status: 'draft',
    })),
  })
  return reportJson(
    (
      await withStaffNames(context.tenantId, [
        visibleReport(context, report.toObject(), order),
      ])
    )[0]
  )
})

export const PATCH = withReportContext(async (req, context) => {
  const body = await req.json()
  if (!Number.isInteger(body.revision) || body.revision < 0)
    reportFailure('Не указана версия отчёта')
  const updatedResult = await withPartyFinancialTransaction(
    context.tenantId,
    async (session) => {
      const Reports = await getPartyReportModel()
      const report = await Reports.findOne({
        _id: reportId(body._id),
        tenantId: context.tenantId,
      })
        .session(session)
        .lean()
      if (!report) reportFailure('Отчёт не найден', 404)
      const Orders = await getPartyOrderModel()
      const order = await Orders.findOneAndUpdate(
        { _id: report.orderId, tenantId: context.tenantId },
        { $inc: { sharedLocationRevision: 1 } },
        { session, new: true }
      ).lean()
      if (!order) reportFailure('Заказ не найден', 404)
      if (!visibleReport(context, report, order))
        reportFailure('Нет доступа к отчёту', 403)
      if (body.action !== 'review')
        requireReportAuthorAssignment(
          context,
          order,
          report.staffId,
          isTeamReport(report) ? 'team' : 'individual'
        )
      if (body.revision !== report.revision)
        reportFailure('Отчёт изменён в другом окне. Обновите его.', 409)
      const answers = updateReportAnswers({
        report,
        context,
        action: body.action,
        answers: body.answers,
        fieldId: body.fieldId,
        decision: body.decision,
        comment: body.comment,
        eventDate: order.eventDate,
        order,
      })
      const Media = await getPartyReportMediaModel()
      for (const answer of answers) {
        const ids = [...new Set(reportMediaIds(answer.html))]
        if (!ids.length) continue
        const count = await Media.countDocuments({
          _id: { $in: ids },
          tenantId: context.tenantId,
          reportId: report._id,
          fieldId: answer.fieldId,
        })
        if (count !== ids.length)
          reportFailure('Фотография не относится к этому полю отчёта')
      }
      const now = new Date()
      // Archive the current immutable revision before a compare-and-swap update.
      // Concurrent writers archive the identical previous state only once.
      const Revisions = await getPartyReportRevisionModel()
      await Revisions.updateOne(
        {
          tenantId: context.tenantId,
          reportId: report._id,
          revision: report.revision,
        },
        {
          $setOnInsert: { snapshot: report },
        },
        { upsert: true, session }
      )
      const updated = await Reports.findOneAndUpdate(
        {
          _id: report._id,
          tenantId: context.tenantId,
          revision: body.revision,
        },
        {
          $set: {
            answers,
            status: reportStatusFromAnswers(answers),
            ...(body.action === 'submit' ? { submittedAt: now } : {}),
          },
          $inc: { revision: 1 },
        },
        { new: true, runValidators: true, session }
      ).lean()
      if (!updated)
        reportFailure('Отчёт изменён в другом окне. Обновите его.', 409)
      return { updated, order }
    }
  )
  const { updated, order } = updatedResult
  const [effectiveUpdated] = await withEffectiveStatuses(
    context.tenantId,
    [updated],
    [order]
  )
  return reportJson(
    (
      await withStaffNames(context.tenantId, [
        visibleReport(context, effectiveUpdated, order),
      ])
    )[0]
  )
})
