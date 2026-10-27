import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyOrderModel } from './partyModels'
import { canPartyAccess } from '../helpers/partyRolePermissions'

// The embedded textarea report has no active writers. Preserve a useful error
// for old links only after verifying membership and the current order scope.
const retiredReportResponse = async (req, { params }) => {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
    permissionAware: true,
  })
  if (error) return error
  const { id } = await params
  if (!isValidObjectId(id))
    return partyError(
      400,
      'partycrm_invalid_report_target',
      'Некорректный заказ',
      'validation'
    )
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: id, tenantId: context.tenantId })
    .select(
      'tenantId status workflowStageId locationId assignedStaff responsibleStaffId'
    )
    .lean()
  if (
    !order ||
    !canPartyAccess(context, { resource: 'orders', order }) ||
    !canPartyAccess(context, { resource: 'reports', order })
  )
    return partyError(
      404,
      'partycrm_order_not_found',
      'Заказ не найден',
      'validation'
    )
  return partyError(
    410,
    'partycrm_legacy_report_retired',
    'Откройте кнопку «Отчёт» в заказе и заполните единую форму компании',
    'validation'
  )
}

export const retirePartyLegacyReport = async (req, route) => {
  try {
    return await retiredReportResponse(req, route)
  } catch {
    return partyError(500, 'partycrm_report_failed', 'Не удалось проверить доступ к форме отчёта')
  }
}
