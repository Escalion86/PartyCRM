import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import { getPushPublicKey } from '@server/pushNotifications'

export const GET = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const publicKey = getPushPublicKey()
  if (!publicKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'VAPID_PUBLIC_KEY не настроен',
      },
      { status: 503 }
    )
  }

  return NextResponse.json({ success: true, data: { publicKey } }, { status: 200 })
}
