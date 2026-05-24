import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import dbConnect from '@server/dbConnect'
import Users from '@models/Users'
import getAuthSecret from '@server/getAuthSecret'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^0-9]/g, '')
}

const isHash = (value) => typeof value === 'string' && value.startsWith('$2')

const encodeBase64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const createToken = (payload, secret) => {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = encodeBase64Url(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', `${secret}`)
    .update(`${header}.${body}`)
    .digest('hex')
  return `${header}.${body}.${signature}`
}

export const POST = async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const phone = normalizePhone(body.phone)
    const password = body.password ?? ''

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: 'Укажите телефон и пароль' },
        { status: 400 }
      )
    }

    await dbConnect()

    const numericPhone = Number(phone)
    const phoneQuery = Number.isNaN(numericPhone)
      ? { phone }
      : { $or: [{ phone }, { phone: numericPhone }] }
    const user = await Users.findOne(phoneQuery)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Неверный телефон или пароль' },
        { status: 401 }
      )
    }

    const passwordValue = user.password ?? ''
    const passwordMatch = isHash(passwordValue)
      ? await bcrypt.compare(password, passwordValue)
      : passwordValue === password

    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: 'Неверный телефон или пароль' },
        { status: 401 }
      )
    }

    // Migrate plain-text password to hash if needed
    if (!isHash(passwordValue)) {
      const hashed = await bcrypt.hash(password, 10)
      await Users.findByIdAndUpdate(user._id, { password: hashed })
    }

    const secret = getAuthSecret()
    const token = createToken(
      {
        uid: String(user._id),
        phone: user.phone ?? phone,
        role: user.role ?? 'user',
        tenantId: user.tenantId ? String(user.tenantId) : null,
        firstName: user.firstName ?? '',
        secondName: user.secondName ?? '',
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      },
      secret
    )

    const { password: _, ...safeUser } = user.toObject()

    return NextResponse.json({
      success: true,
      token,
      user: {
        _id: String(safeUser._id),
        phone: safeUser.phone ?? phone,
        firstName: safeUser.firstName ?? '',
        secondName: safeUser.secondName ?? '',
        email: safeUser.email ?? '',
        role: safeUser.role ?? 'user',
        tenantId: safeUser.tenantId ? String(safeUser.tenantId) : null,
        tariffId: safeUser.tariffId ? String(safeUser.tariffId) : null,
      },
    })
  } catch (error) {
    console.error('Mobile auth error:', error)
    return NextResponse.json(
      { success: false, error: 'Ошибка сервера' },
      { status: 500 }
    )
  }
}
