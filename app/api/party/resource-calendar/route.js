import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { loadPartyResourceCalendar } from '@server/partyResourceCalendar'
import { parsePartyResourceCalendarQuery } from '@helpers/partyResourceCalendar'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true, permissionAware: true })
    if (error) return error
    const query = parsePartyResourceCalendarQuery(req.nextUrl?.searchParams || new URL(req.url).searchParams)
    const data = await loadPartyResourceCalendar({ context, query })
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (failure) {
    const status = failure.status || 500
    return partyError(status, failure.code || 'partycrm_resource_calendar_failed', status < 500 ? failure.message : 'Не удалось загрузить календарь ресурсов', status === 403 ? 'permission' : status < 500 ? 'validation' : 'server')
  }
}
