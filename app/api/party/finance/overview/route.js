import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { getPartyFinancialOverview } from '@server/partyFinancialOverview'

export const dynamic = 'force-dynamic'
export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  try {
    const params = new URL(req.url).searchParams
    const data = await getPartyFinancialOverview({
      context,
      from: params.get('from'),
      to: params.get('to'),
    })
    return NextResponse.json({ success: true, data })
  } catch (failure) {
    const status = failure.status || 500
    return partyError(
      status,
      failure.code || 'partycrm_finance_overview_failed',
      status < 500 ? failure.message : 'Не удалось загрузить финансовый обзор',
      status === 403 ? 'permission' : status < 500 ? 'validation' : 'server'
    )
  }
}
