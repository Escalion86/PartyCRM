import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from './partyApi'
import {
  canPartyAccess,
  isPartyRestrictedManagementContext,
} from '../helpers/partyRolePermissions.js'

export const financialResponse = (data, status = 200) =>
  NextResponse.json({ success: true, data }, { status })
export const financialRoute =
  (handler, { managementOnly = false } = {}) =>
  async (req, params) => {
    const { context, error } = await getPartyRequestContext({
      req,
      managementOnly,
      allowLocationOwner: true,
    })
    if (error) return error
    const scope = context.position?.orderScope || {}
    // These legacy screens aggregate whole financial periods and do not mask
    // individual orders. Scoped roles use the permission-aware transaction API.
    if (
      isPartyRestrictedManagementContext(context) ||
      context.role === 'location_owner' ||
      scope.stageIds?.length ||
      scope.statuses?.length ||
      scope.locationIds?.length ||
      scope.assignedOnly ||
      scope.includeUnlocated === false
    )
      return partyError(
        403,
        'partycrm_financial_scope_unsupported',
        'Для этой должности доступны финансовые операции внутри разрешённых заказов',
        'permission'
      )
    const action = req.method === 'GET' ? 'read' : 'edit'
    const management =
      ['owner', 'admin'].includes(context.role) || managementOnly
    if (
      !(management
        ? canPartyAccess(context, { resource: 'finance.payouts', action })
        : canPartyAccess(context, { resource: 'reports.finance', action }) ||
          canPartyAccess(context, { resource: 'finance.payouts', action }))
    )
      return partyError(
        403,
        'partycrm_finance_forbidden',
        'Нет доступа к финансовой сверке',
        'permission'
      )
    try {
      return await handler(req, context, params)
    } catch (failure) {
      const status =
        failure.status ||
        (failure.name === 'ValidationError' || failure.name === 'CastError'
          ? 400
          : 500)
      return partyError(
        status,
        'partycrm_financial_settlement_error',
        status < 500
          ? failure.message
          : 'Не удалось выполнить финансовую операцию',
        status === 403 ? 'permission' : status < 500 ? 'validation' : 'server'
      )
    }
  }
