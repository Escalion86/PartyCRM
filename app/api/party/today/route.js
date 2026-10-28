import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { loadPartyToday } from '@server/partyToday'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { context, error } = await getPartyRequestContext({
      req,
      allowLocationOwner: true,
    })
    if (error) return error
    const data = await loadPartyToday({ context })
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (failure) {
    const status = failure.status || 500
    return partyError(
      status,
      failure.code || 'partycrm_today_failed',
      status < 500 ? failure.message : 'Не удалось загрузить рабочий экран',
      status === 403 ? 'permission' : 'server'
    )
  }
}
