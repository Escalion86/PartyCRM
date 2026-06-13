import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import {
  normalizePartyInterfaceRoles,
  normalizePartyPhone,
  setPartySessionCookie,
  validatePartyPassword,
} from '@server/partyAuth'
import { getPartyAuthInfrastructureError } from '@server/partyAuthError'

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

  try {
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

    await PartyUsers.updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date() } }
    )

    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          _id: String(user._id),
          phone: user.phone,
          email: user.email,
          firstName: user.firstName,
          secondName: user.secondName,
          interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
          lastWorkspace: ['company', 'performer'].includes(user.lastWorkspace)
            ? user.lastWorkspace
            : '',
          performerOnboardingCompletedAt:
            user.performerOnboardingCompletedAt || null,
        },
      },
    })
    return setPartySessionCookie(response, user)
  } catch (error) {
    const infrastructureError = getPartyAuthInfrastructureError(error)
    console.error('party auth login failed', {
      code: infrastructureError.code,
      error: error?.message,
    })
    return NextResponse.json(
      {
        success: false,
        error: infrastructureError.message,
        errorCode: infrastructureError.code,
      },
      { status: infrastructureError.status }
    )
  }
}
