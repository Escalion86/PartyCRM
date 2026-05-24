import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import { syncYookassaPayment } from '@server/yookassaPaymentProcessing'

export const POST = async (req) => {
  const secret = String(process.env.YOOKASSA_WEBHOOK_SECRET || '').trim()
  if (secret) {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || req.headers.get('x-webhook-token')
    if (token !== secret) {
      return NextResponse.json({ success: false }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const providerPaymentId = String(body?.object?.id || '').trim()
  if (!providerPaymentId) {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  await dbConnect()

  const result = await syncYookassaPayment({ providerPaymentId })
  return NextResponse.json({ success: true, data: result }, { status: 200 })
}
