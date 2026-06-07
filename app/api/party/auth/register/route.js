import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import PhoneConfirms from '@models/PhoneConfirms'
import {
  hashPartyPassword,
  normalizePartyEmail,
  normalizePartyInterfaceRoles,
  normalizePartyPhone,
  setPartySessionCookie,
} from '@server/partyAuth'
import { PARTY_WORKSPACE_TYPES } from '@server/partyEntry'

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePartyPhone(body.phone)
  const password = String(body.password || '')
  const interfaceRoles = normalizePartyInterfaceRoles(body.interfaceRoles)
  const consentPrivacyPolicy = body?.consentPrivacyPolicy === true
  const consentPersonalData = body?.consentPersonalData === true

  if (!phone || !password) {
    return NextResponse.json(
      { success: false, error: 'Укажите телефон и пароль' },
      { status: 400 }
    )
  }
  if (phone.length !== 11) {
    return NextResponse.json(
      { success: false, error: 'Некорректный номер телефона' },
      { status: 400 }
    )
  }
  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: 'Пароль должен быть не менее 8 символов' },
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

  // Проверяем, что телефон подтверждён через TELEFONIP или SMS
  const phoneConfirm = await PhoneConfirms.findOne({
    phone,
    flow: 'register',
    confirmed: true,
  })
  if (!phoneConfirm) {
    return NextResponse.json(
      {
        success: false,
        error: 'Сначала подтвердите номер телефона',
      },
      { status: 403 }
    )
  }

  const PartyUsers = await getPartyUserModel()
  const existingUser = await PartyUsers.findOne({ phone }).lean()
  if (existingUser) {
    return NextResponse.json(
      {
        success: false,
        error: 'Пользователь PartyCRM с таким номером уже существует',
      },
      { status: 409 }
    )
  }

  let user = null
  try {
    const now = new Date()
    const lastWorkspace = interfaceRoles.includes(PARTY_WORKSPACE_TYPES.COMPANY)
      ? PARTY_WORKSPACE_TYPES.COMPANY
      : interfaceRoles.includes(PARTY_WORKSPACE_TYPES.PERFORMER)
        ? PARTY_WORKSPACE_TYPES.PERFORMER
        : ''
    user = await PartyUsers.create({
      phone,
      email: normalizePartyEmail(body.email),
      password: await hashPartyPassword(password),
      firstName: String(body.firstName || '').trim().slice(0, 100),
      secondName: String(body.secondName || '').trim().slice(0, 100),
      interfaceRoles,
      lastWorkspace,
      consentPrivacyPolicyAccepted: true,
      consentPersonalDataAccepted: true,
      privacyPolicyAcceptedAt: now,
      personalDataProcessingAcceptedAt: now,
      lastLoginAt: now,
    })
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Пользователь PartyCRM с таким номером уже существует',
        },
        { status: 409 }
      )
    }
    throw error
  }

  const response = NextResponse.json(
    {
      success: true,
      data: {
        user: {
          _id: String(user._id),
          phone: user.phone,
          email: user.email,
          firstName: user.firstName,
          secondName: user.secondName,
          interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
          lastWorkspace: user.lastWorkspace || '',
          performerOnboardingCompletedAt:
            user.performerOnboardingCompletedAt || null,
        },
      },
    },
    { status: 201 }
  )
  return setPartySessionCookie(response, user)
}
