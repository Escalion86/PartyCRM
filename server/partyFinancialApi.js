import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from './partyApi'

export const financialResponse = (data, status = 200) =>
  NextResponse.json({ success: true, data }, { status })
export const financialRoute =
  (handler, { managementOnly = false } = {}) =>
  async (req, params) => {
    const { context, error } = await getPartyRequestContext({
      req,
      managementOnly,
    })
    if (error) return error
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
