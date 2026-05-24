import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import getPartyMembershipContext from './getPartyMembershipContext'

export const PARTY_MANAGEMENT_ROLES = Object.freeze(['owner', 'admin'])

export const partyError = (status, code, message, type = 'server', extra = {}) =>
  NextResponse.json(
    {
      success: false,
      error: {
        code,
        type,
        message,
      },
      ...extra,
    },
    { status }
  )

export const isValidObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const getRequestedCompanyId = (req) =>
  String(req?.headers?.get('x-partycrm-company-id') || '').trim()

const buildMembershipContextShell = (membershipContext) => ({
  ...membershipContext,
  staff: null,
  company: null,
  tenantId: null,
  role: null,
  activeMembership: null,
})

const getContextByRequestedCompany = async (req, membershipContext) => {
  const requestedCompanyId = getRequestedCompanyId(req)
  if (!requestedCompanyId) {
    return {
      context: buildMembershipContextShell(membershipContext),
      error: partyError(
        400,
        'partycrm_company_id_required',
        'Не выбрана активная компания',
        'validation'
      ),
    }
  }

  if (!isValidObjectId(requestedCompanyId)) {
    return {
      context: buildMembershipContextShell(membershipContext),
      error: partyError(
        400,
        'partycrm_invalid_company_id',
        'Некорректный id компании',
        'validation'
      ),
    }
  }

  const membership = membershipContext.memberships.find(
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
      },
      error: partyError(
        403,
        'partycrm_company_access_denied',
        'Нет доступа к выбранной компании',
        'permission'
      ),
    }
  }

  return {
    context: {
      ...membershipContext,
      staff: membership.staff,
      company: membership.company,
      tenantId: membership.tenantId,
      role: membership.role,
      activeMembership: membership,
    },
    error: null,
  }
}

export const getPartyRequestContext = async ({
  req = null,
  managementOnly = false,
} = {}) => {
  const membershipContext = await getPartyMembershipContext()

  if (!membershipContext.sessionUser?._id) {
    return {
      context: buildMembershipContextShell(membershipContext),
      error: partyError(401, 'unauthorized', 'Не авторизован', 'auth'),
    }
  }

  const requestedContext = await getContextByRequestedCompany(
    req,
    membershipContext
  )
  if (requestedContext?.error) return requestedContext

  const context = requestedContext.context

  if (!context.tenantId || !context.staff) {
    return {
      context,
      error: partyError(
        403,
        'partycrm_access_not_configured',
        'Для пользователя не настроен доступ к PartyCRM',
        'permission'
      ),
    }
  }

  if (managementOnly && !PARTY_MANAGEMENT_ROLES.includes(context.role)) {
    return {
      context,
      error: partyError(
        403,
        'partycrm_forbidden',
        'Недостаточно прав для действия',
        'permission'
      ),
    }
  }

  return { context, error: null }
}

export const parseJsonBody = async (req) => {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}
