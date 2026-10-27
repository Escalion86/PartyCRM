import { NextResponse } from 'next/server'
import { getPartyRequestContext, parseJsonBody, partyError } from '@server/partyApi'
import { createPartyTicketingService } from '@server/partyTicketing'

const handle = (method) => async (req) => {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return error
  try {
    const service = createPartyTicketingService()
    const result = method === 'read' ? await service.read(context, new URL(req.url).searchParams) : await service.mutate(context, await parseJsonBody(req))
    return NextResponse.json({ success: true, ...result })
  } catch (cause) {
    return partyError(cause.status || 500, cause.status ? cause.code || 'partycrm_ticketing_invalid' : 'partycrm_ticketing_failed', cause.status ? cause.message : 'Не удалось обработать билетную операцию')
  }
}
export const GET = handle('read')
export const POST = handle('mutate')
export const PATCH = handle('mutate')
