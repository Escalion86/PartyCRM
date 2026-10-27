import {
  loadReportOrder,
  reportId,
  reportJson,
  reportTemplateApplicability,
  validateReportFields,
  withReportContext,
} from '@server/partyReportAccess'
import {
  reportFailure,
  validateReportAudience,
  hasPartyReportPermission,
} from '@server/partyReportCore'
import {
  normalizePartyReportPolicy,
  partyReportDueAt,
} from '@helpers/partyReportPolicy'
import {
  loadPartyReportAuthorContexts,
  filterPartyReportTemplatesForAuthor,
} from '@server/partyReportAuthorAccess'

export const dynamic = 'force-dynamic'

export const POST = withReportContext(async (req, context) => {
  const body = await req.json()
  if (!['before', 'after'].includes(body.stage))
    reportFailure('Выберите этап формы')
  const order = await loadReportOrder(context.tenantId, reportId(body.orderId))
  if (!hasPartyReportPermission(context, 'reports', 'read', order))
    reportFailure('Нет доступа к выбранному заказу', 403)
  const fields = await validateReportFields(context.tenantId, body.fields)
  let policy
  try {
    policy = normalizePartyReportPolicy(body)
  } catch (error) {
    reportFailure(error.message)
  }
  const template = {
    fields,
    stage: body.stage,
    audience: validateReportAudience(body.audience),
    ...policy,
  }
  const [applicable] = await reportTemplateApplicability(
    context.tenantId,
    order,
    [template]
  )
  const included = new Set((applicable?.fields || []).map((field) => field.id))
  let readable = included
  if (body.staffId) {
    const staffId = reportId(body.staffId)
    const authors = await loadPartyReportAuthorContexts(context.tenantId, [
      staffId,
    ])
    const author = authors.get(staffId)
    if (!author || author.staff.status !== 'active')
      reportFailure('Исполнитель недоступен в этой компании', 400)
    const [visible] = filterPartyReportTemplatesForAuthor(
      [template],
      { ...author, company: context.company },
      order
    )
    readable = new Set((visible?.fields || []).map((field) => field.id))
  }
  return reportJson({
    order: {
      id: String(order._id),
      title:
        (hasPartyReportPermission(context, 'orders.title', 'read', order) &&
          order.title) ||
        (hasPartyReportPermission(
          context,
          'orders.serviceTitle',
          'read',
          order
        ) &&
          order.serviceTitle) ||
        'Заказ',
      eventDate: hasPartyReportPermission(
        context,
        'orders.eventDate',
        'read',
        order
      )
        ? order.eventDate
        : null,
    },
    dueAt: partyReportDueAt(policy, order),
    fields: fields.map((field) => ({
      ...field,
      applicable: included.has(field.id) && readable.has(field.id),
      exclusionReason: !included.has(field.id)
        ? 'Не совпадают выбранные связи с заказом.'
        : !readable.has(field.id)
          ? 'Раздел отчёта скрыт для должности выбранного исполнителя или заказ вне её области доступа.'
          : '',
    })),
  })
}, true)
