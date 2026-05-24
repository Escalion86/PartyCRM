import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import Tariffs from '@models/Tariffs'
import PhoneConfirms from '@models/PhoneConfirms'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^0-9]/g, '')
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const password = body.password ?? ''
  const legacyTermsAccepted =
    body?.registerTermsAccepted === true || body?.termsAccepted === true
  const consentPrivacyPolicy =
    body?.consentPrivacyPolicy === true || legacyTermsAccepted
  const consentPersonalData =
    body?.consentPersonalData === true || legacyTermsAccepted

  if (!phone || !password) {
    return NextResponse.json(
      { success: false, error: 'Укажите телефон и пароль' },
      { status: 400 }
    )
  }
  if (String(password).length < 8) {
    return NextResponse.json(
      { success: false, error: 'Пароль должен быть не менее 8 символов' },
      { status: 400 }
    )
  }
  if (phone.length !== 11) {
    return NextResponse.json(
      { success: false, error: 'INVALID_PHONE_LENGTH' },
      { status: 400 }
    )
  }

  if (!consentPrivacyPolicy || !consentPersonalData) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Для регистрации требуется согласие с Политикой конфиденциальности и обработкой персональных данных',
      },
      { status: 400 }
    )
  }

  await dbConnect()

  const phoneConfirm = await PhoneConfirms.findOne({ phone, flow: 'register' })
  const confirmExpired =
    !phoneConfirm?.expiresAt ||
    new Date(phoneConfirm.expiresAt).getTime() <= Date.now()
  if (!phoneConfirm?.confirmed || confirmExpired) {
    return NextResponse.json(
      { success: false, error: 'PHONE_NOT_CONFIRMED' },
      { status: 403 }
    )
  }

  const numericPhone = Number(phone)
  const phoneQuery = Number.isNaN(numericPhone)
    ? { phone }
    : { $or: [{ phone }, { phone: numericPhone }] }
  const existingUser = await Users.findOne(phoneQuery)

  if (existingUser) {
    return NextResponse.json(
      { success: false, error: 'Пользователь с таким номером уже существует' },
      { status: 409 }
    )
  }

  try {
    const hashed = await bcrypt.hash(password, 10)
    const cheapestTariff = await Tariffs.findOne({
      hidden: { $ne: true },
    })
      .sort({ price: 1, title: 1 })
      .lean()
    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const user = await Users.create({
      phone,
      password: hashed,
      role: 'user',
      tenantId: null,
      tariffId: cheapestTariff?._id ?? null,
      trialActivatedAt: now,
      trialEndsAt,
      trialUsed: true,
      consentPrivacyPolicyAccepted: true,
      consentPersonalDataAccepted: true,
      privacyPolicyAcceptedAt: now,
      personalDataProcessingAcceptedAt: now,
    })

    if (!user.tenantId) {
      user.tenantId = user._id
      await user.save()
    }

    await PhoneConfirms.deleteMany({ phone })
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Пользователь с таким номером уже существует' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Не удалось зарегистрироваться' },
      { status: 500 }
    )
  }
}
