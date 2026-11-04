import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { loadPartyBookingAvailability } from '@server/partyBookingAvailability'

export const dynamic = 'force-dynamic'
export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  try {
    return NextResponse.json(
      {
        success: true,
        data: await loadPartyBookingAvailability({
          context,
          body: await parseJsonBody(req),
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (cause) {
    return partyError(
      cause.status || 500,
      cause.code || 'partycrm_availability_failed',
      cause.status ? cause.message : 'Не удалось проверить свободное время'
    )
  }
}
