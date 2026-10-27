import { getPartyReportModel } from './partyReportModels'
import {
  latestReportTemplates,
  reportTemplateApplicability,
  reportId,
} from './partyReportAccess'
import { partyReportGateBlockers } from '../helpers/partyReportPolicy.js'
import {
  loadPartyReportAuthorContexts,
  partyReportWithEffectiveStatus,
  filterPartyReportTemplatesForAuthor,
} from './partyReportAuthorAccess'

export const getPartyReportGateBlockers = async ({
  tenantId,
  order,
  action = 'close',
  staffId,
  session,
}) => {
  reportId(String(order._id))
  if (String(order.tenantId) !== String(tenantId))
    throw new Error('Заказ не принадлежит компании')
  if (action === 'payout' && !staffId)
    throw new Error('Для проверки выплаты требуется сотрудник')
  const Reports = await getPartyReportModel()
  const query = Reports.find({ tenantId, orderId: order._id })
  // A MongoDB transaction must execute its session operations sequentially.
  const [templates, reports] = session
    ? [
        await latestReportTemplates(tenantId, session),
        await query.session(session).lean(),
      ]
    : await Promise.all([latestReportTemplates(tenantId), query.lean()])
  const applicable = await reportTemplateApplicability(
    tenantId,
    order,
    templates.filter((template) => template.active),
    session
  )
  const authorContexts = await loadPartyReportAuthorContexts(
    tenantId,
    (order.assignedStaff || []).map((person) => person.staffId),
    session
  )
  const templatesForStaff = new Map(
    [...authorContexts].map(([id, context]) => [
      id,
      filterPartyReportTemplatesForAuthor(applicable, context, order),
    ])
  )
  return partyReportGateBlockers({
    order,
    templates: applicable,
    templatesForStaff,
    reports: reports.map((report) =>
      partyReportWithEffectiveStatus(
        report,
        authorContexts.get(String(report.staffId)),
        order
      )
    ),
    action,
    staffId,
  })
}

export const assertPartyReportGate = async (options) => {
  const blockers = await getPartyReportGateBlockers(options)
  if (blockers.length)
    throw Object.assign(
      new Error(
        options.action === 'payout'
          ? 'Выплата заблокирована: личный отчёт исполнителя ещё не принят.'
          : `Заказ нельзя закрыть: не приняты обязательные отчёты (${blockers.length}).`
      ),
      { status: 409, code: 'partycrm_report_required' }
    )
}
