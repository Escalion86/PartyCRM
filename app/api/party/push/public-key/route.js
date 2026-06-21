import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import { getPartySessionUser } from '@server/partyAuth'
import { getPushPublicKey } from '@server/pushNotifications'

export async function GET(req) {
  const hasCompanyContext = Boolean(
    String(req.headers.get('x-partycrm-company-id') || '').trim()
  )
  if (hasCompanyContext) {
    const { error } = await getPartyRequestContext({
      req,
      managementOnly: true,
    })
    if (error) return error
  } else {
    const user = await getPartySessionUser()
    if (!user?._id) {
      return NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      )
    }
  }

  const publicKey = getPushPublicKey()
  if (!publicKey) {
    return NextResponse.json(
      { success: false, error: 'VAPID public key is not configured' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: { publicKey },
  })
}
