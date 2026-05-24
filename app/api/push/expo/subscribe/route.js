import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { normalizePushToken, saveExpoPushToken } from '@server/expoPushNotifications'

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const pushToken = normalizePushToken(body?.pushToken)
  if (!pushToken) {
    return NextResponse.json(
      { success: false, error: 'Некорректный Expo push token' },
      { status: 400 }
    )
  }

  await dbConnect()
  await saveExpoPushToken({
    tenantId,
    pushToken,
    deviceId: body?.deviceId,
    platform: body?.platform,
    appVersion: body?.appVersion,
  })

  return NextResponse.json({ success: true }, { status: 200 })
}
