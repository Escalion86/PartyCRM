import { NextResponse } from 'next/server'
import { getPartyRequestContext, parseJsonBody, partyError } from '@server/partyApi'
import { createPartyTicketProviderService } from '@server/partyTicketProviders'

export const dynamic = 'force-dynamic'
const handle = (write) => async (req) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  try {
    const service = createPartyTicketProviderService()
    const data = write ? await service.mutate(context, await parseJsonBody(req)) : await service.list(context)
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    return partyError(cause.status || 500, cause.status ? cause.code : 'partycrm_provider_failed', cause.status ? cause.message : 'Не удалось обработать подключение')
  }
}
export const GET = handle(false)
export const POST = handle(true)
