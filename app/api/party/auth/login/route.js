import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import {
  normalizePartyPhone,
  setPartySessionCookie,
  validatePartyPassword,
} from '@server/partyAuth'

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePartyPhone(body.phone)
  const password = String(body.password || '')

  if (!phone || !password) {
    return NextResponse.json(
      { success: false, error: 'Укажите телефон и пароль' },
      { status: 400 }
    )
  }

  const PartyUsers = await getPartyUserModel()
  const user = await PartyUsers.findOne({
    phone,
    status: { $ne: 'archived' },
  })

  const passwordValid = await validatePartyPassword(password, user?.password)
  if (!user || !passwordValid) {
    return NextResponse.json(
      { success: false, error: 'Неверный телефон или пароль' },
      { status: 401 }
    )
  }

  user.lastLoginAt = new Date()
  await user.save()

  const response = NextResponse.json({
    success: true,
    data: {
      user: {
        _id: String(user._id),
        phone: user.phone,
        email: user.email,
        firstName: user.firstName,
        secondName: user.secondName,
      },
    },
  })
  return setPartySessionCookie(response, user)
}
