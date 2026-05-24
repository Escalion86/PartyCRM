import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import Users from '@models/Users'
import Payments from '@models/Payments'

const sanitizeUser = (user) => {
  if (!user) return null
  const data = typeof user.toObject === 'function' ? user.toObject() : user
  const { password, ...rest } = data
  return rest
}

export const GET = async (req) => {
  const { user, tenantId } = await getTenantContext()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Не указан пользователь' },
      { status: 400 }
    )
  }

  const isAdmin = ['dev', 'admin'].includes(user?.role)
  const isSelf = String(user?._id) === String(userId)
  if (!isAdmin && !isSelf) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  await dbConnect()

  const query = isAdmin ? { userId } : { userId, tenantId }
  const payments = await Payments.find(query)
    .sort({ createdAt: -1 })
    .lean()
  return NextResponse.json({ success: true, data: payments }, { status: 200 })
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { user, tenantId } = await getTenantContext()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (!['dev', 'admin'].includes(user?.role)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  const amount = Number(body.amount ?? 0)
  if (!body.userId) {
    return NextResponse.json(
      { success: false, error: 'Не указан пользователь' },
      { status: 400 }
    )
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, error: 'Некорректная сумма' },
      { status: 400 }
    )
  }

  await dbConnect()

  const userToUpdate = await Users.findById(body.userId)
  if (!userToUpdate) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const balance = Number(userToUpdate.balance ?? 0)
  userToUpdate.balance = balance + amount
  await userToUpdate.save()

  const payment = await Payments.create({
    userId: userToUpdate._id,
    tenantId: userToUpdate.tenantId ?? tenantId ?? userToUpdate._id,
    tariffId: userToUpdate.tariffId ?? null,
    amount,
    type: 'topup',
    source: 'manual',
    comment: body.comment ?? '',
  })

  return NextResponse.json(
    { success: true, data: { user: sanitizeUser(userToUpdate), payment } },
    { status: 201 }
  )
}
