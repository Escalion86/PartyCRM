import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { parseSubscription, savePushSubscription } from '@server/pushNotifications'

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const subscription = parseSubscription(body?.subscription)
  if (!subscription) {
    return NextResponse.json(
      { success: false, error: 'Некорректная push-подписка' },
      { status: 400 }
    )
  }

  await dbConnect()
  await savePushSubscription({
    tenantId,
    subscription,
    userAgent: req.headers.get('user-agent') || '',
    isActive: true,
  })

  return NextResponse.json({ success: true }, { status: 200 })
}
