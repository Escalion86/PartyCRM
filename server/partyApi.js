import { NextResponse } from 'next/server'
import getPartyMembershipContext from './getPartyMembershipContext'
import {
  PARTY_MANAGEMENT_ROLES,
  isValidPartyObjectId,
  resolvePartyRequestContext,
} from './partyApiCore'

export { PARTY_MANAGEMENT_ROLES }

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
  isValidPartyObjectId(value)

const getRequestedCompanyId = (req) =>
  String(req?.headers?.get('x-partycrm-company-id') || '').trim()

const toPartyErrorResponse = (error) =>
  partyError(error.status, error.code, error.message, error.type)

export const getPartyRequestContext = async ({
  req = null,
  managementOnly = false,
} = {}) => {
  const membershipContext = await getPartyMembershipContext()
  const resolved = resolvePartyRequestContext({
    membershipContext,
    requestedCompanyId: getRequestedCompanyId(req),
    managementOnly,
  })

  if (resolved.error) {
    return {
      context: resolved.context,
      error: toPartyErrorResponse(resolved.error),
    }
  }

  return resolved
}

export const parseJsonBody = async (req) => {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}
