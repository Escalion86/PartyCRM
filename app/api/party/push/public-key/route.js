import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import { getPushPublicKey } from '@server/pushNotifications'

export async function GET(req) {
  const { error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

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
