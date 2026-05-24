import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { deactivatePushSubscription, parseSubscription } from '@server/pushNotifications'

const resolveEndpoint = (body) => {
  if (typeof body?.endpoint === 'string') return body.endpoint
  const parsed = parseSubscription(body?.subscription)
  return parsed?.endpoint || ''
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const endpoint = String(resolveEndpoint(body) || '').trim()
  if (!endpoint) {
    return NextResponse.json(
      { success: false, error: 'endpoint обязателен' },
      { status: 400 }
    )
  }

  await dbConnect()
  await deactivatePushSubscription({ tenantId, endpoint })
  return NextResponse.json({ success: true }, { status: 200 })
}
