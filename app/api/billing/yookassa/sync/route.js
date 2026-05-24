import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import Payments from '@models/Payments'
import { syncYookassaPayment } from '@server/yookassaPaymentProcessing'

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const paymentId = String(body?.paymentId || '').trim()
  if (!paymentId) {
    return NextResponse.json(
      { success: false, error: 'Не указан платеж' },
      { status: 400 }
    )
  }

  await dbConnect()

  const payment = await Payments.findOne({
    _id: paymentId,
    provider: 'yookassa',
  }).lean()
  if (!payment) {
    return NextResponse.json(
      { success: false, error: 'Платеж не найден' },
      { status: 404 }
    )
  }

  const isAdmin = ['dev', 'admin'].includes(user?.role)
  const isOwner = String(payment.userId) === String(user._id)
  if (!isAdmin && !isOwner) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  const result = await syncYookassaPayment({ paymentId })
  return NextResponse.json({ success: result.ok, data: result }, { status: 200 })
}
