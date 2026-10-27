import mongoose from 'mongoose'
import { isPartyRestrictedManagementContext } from '../helpers/partyRolePermissions.js'

export const PARTY_MANAGEMENT_ROLES = Object.freeze(['owner', 'admin'])

export const isValidPartyObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

export const buildPartyContextShell = (membershipContext) => ({
  ...membershipContext,
  staff: null,
  company: null,
  tenantId: null,
  role: null,
  activeMembership: null,
  position: null,
  access: null,
})

export const partyContextError = (status, code, message, type = 'server') => ({
  status,
  code,
  message,
  type,
})

export const resolvePartyRequestContext = ({
  membershipContext,
  requestedCompanyId = '',
  managementOnly = false,
  allowLocationOwner = false,
  permissionAware = false,
} = {}) => {
  if (!membershipContext?.sessionUser?._id) {
    return {
      context: buildPartyContextShell(membershipContext ?? {}),
      error: partyContextError(401, 'unauthorized', 'Не авторизован', 'auth'),
    }
  }

  if (!requestedCompanyId) {
    return {
      context: buildPartyContextShell(membershipContext),
      error: partyContextError(
        400,
        'partycrm_company_id_required',
        'Не выбрана активная компания',
        'validation'
      ),
    }
  }

  if (!isValidPartyObjectId(requestedCompanyId)) {
    return {
      context: buildPartyContextShell(membershipContext),
      error: partyContextError(
        400,
        'partycrm_invalid_company_id',
        'Некорректный id компании',
        'validation'
      ),
    }
  }

  const membership = (membershipContext.memberships ?? []).find(
    (item) => String(item.tenantId) === requestedCompanyId
  )

  if (!membership) {
    return {
      context: {
        ...membershipContext,
        staff: null,
        company: null,
        tenantId: null,
        role: null,
        activeMembership: null,
      },
      error: partyContextError(
        403,
        'partycrm_company_access_denied',
        'Нет доступа к выбранной компании',
        'permission'
      ),
    }
  }

  const membershipStatus =
    membership.status || membership.staff?.status || 'active'
  if (membershipStatus !== 'active') {
    return {
      context: {
        ...membershipContext,
        staff: membership.staff ?? null,
        company: membership.company ?? null,
        tenantId: membership.tenantId ?? null,
        role: membership.role ?? null,
        activeMembership: membership,
      },
      error: partyContextError(
        403,
        'partycrm_membership_inactive',
        'Доступ к выбранной компании не активен',
        'permission'
      ),
    }
  }

  const context = {
    ...membershipContext,
    staff: membership.staff,
    company: membership.company,
    tenantId: membership.tenantId,
    role: membership.role,
    activeMembership: membership,
    position: membership.position || null,
    access: membership.access || null,
  }

  if ((context.staff?.positionId && !context.position) || context.position?.active === false) {
    return { context, error: partyContextError(403, 'partycrm_position_inactive', 'Должность сотрудника недоступна', 'permission') }
  }

  if (!context.tenantId || !context.staff) {
    return {
      context,
      error: partyContextError(
        403,
        'partycrm_access_not_configured',
        'Для пользователя не настроен доступ к PartyCRM',
        'permission'
      ),
    }
  }

  if (
    (context.role === 'location_owner' && !allowLocationOwner) ||
    (managementOnly && !PARTY_MANAGEMENT_ROLES.includes(context.role))
  ) {
    return {
      context,
      error: partyContextError(
        403,
        'partycrm_forbidden',
        'Недостаточно прав для действия',
        'permission'
      ),
    }
  }

  // Legacy management APIs do not mask fields or apply order scopes. A server
  // handler must explicitly opt in only after implementing its granular checks.
  if (managementOnly && !permissionAware && isPartyRestrictedManagementContext(context)) {
    return { context, error: partyContextError(403, 'partycrm_granular_permissions_required', 'Этот раздел пока недоступен для администратора с ограниченными полномочиями', 'permission') }
  }

  return { context, error: null }
}
