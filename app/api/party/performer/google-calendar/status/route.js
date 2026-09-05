import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { createPerformerCore, jsonResult } from '../_shared'

export async function GET() {
  const { sessionUser } = await getPartyMembershipContext({ excludeLocationOwners: true })
  if (!sessionUser?._id) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Не авторизован' } },
      { status: 401 }
    )
  }
  return jsonResult(
    await createPerformerCore().status({ userId: String(sessionUser._id) })
  )
}
