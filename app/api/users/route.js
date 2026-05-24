import { NextResponse } from 'next/server'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import bcrypt from 'bcryptjs'
import Tariffs from '@models/Tariffs'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const sanitizeUser = (user) => {
  if (!user) return null
  const data = typeof user.toObject === 'function' ? user.toObject() : user
  const { password, ...rest } = data
  return rest
}

export const GET = async () => {
  const { user, tenantId } = await getTenantContext()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const canManageAllUsers = ['dev', 'admin'].includes(user?.role)
  const query = canManageAllUsers ? {} : { tenantId }
  const users = await Users.find(query).select('-password').lean()
  return NextResponse.json({ success: true, data: users }, { status: 200 })
}

export const POST = async (req) => {
  const body = await req.json()
  const { user } = await getTenantContext()
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
  await dbConnect()

  const normalizedPhone = normalizePhone(body.phone)
  const phoneAsNumber = normalizedPhone ? Number(normalizedPhone) : null
  if (normalizedPhone) {
    const phoneQuery = Number.isNaN(phoneAsNumber)
      ? { phone: normalizedPhone }
      : { $or: [{ phone: normalizedPhone }, { phone: phoneAsNumber }] }
    const exists = await Users.findOne(phoneQuery).lean()
    if (exists) {
      return NextResponse.json(
        { success: false, error: 'Телефон уже используется' },
        { status: 409 }
      )
    }
  }

  const payload = {
    ...body,
    phone: normalizedPhone || '',
  }

  if (!payload.tariffId) {
    const cheapestTariff = await Tariffs.findOne({
      hidden: { $ne: true },
    })
      .sort({ price: 1, title: 1 })
      .lean()
    payload.tariffId = cheapestTariff?._id ?? null
  }

  if (payload.password) {
    payload.password = await bcrypt.hash(payload.password, 10)
  } else {
    delete payload.password
  }

  const created = await Users.create(payload)
  const tenantId = payload.tenantId ?? created._id
  if (!created.tenantId) {
    created.tenantId = tenantId
    await created.save()
  }

  return NextResponse.json(
    { success: true, data: sanitizeUser(created) },
    { status: 201 }
  )
}
