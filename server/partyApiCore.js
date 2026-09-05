import mongoose from 'mongoose'

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

  return { context, error: null }
}
