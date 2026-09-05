import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from './partyApi'

export const inventoryResponse = (data, status = 200) =>
  NextResponse.json({ success: true, data }, { status })
export const inventoryRoute = (handler) => async (req, params) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
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
      'partycrm_inventory_error',
      status < 500 || status === 503
        ? failure.message
        : 'Не удалось выполнить операцию со складом',
      status < 500 ? 'validation' : 'server'
    )
  }
}
