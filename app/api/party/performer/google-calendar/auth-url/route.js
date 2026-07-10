import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { nonceCookieOptions } from '../../../google-calendar/_shared'
import { createPerformerCore, jsonResult } from '../_shared'

export async function GET() {
  const { sessionUser } = await getPartyMembershipContext()
  if (!sessionUser?._id) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Не авторизован' } },
      { status: 401 }
    )
  }
  const result = await createPerformerCore().authUrl({
    userId: String(sessionUser._id),
  })
  if (result.error) return jsonResult(result)
  const response = NextResponse.json({ success: true, data: result.data })
  response.cookies.set(result.cookieName, result.nonce, nonceCookieOptions)
  return response
}
