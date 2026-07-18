import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import {
  normalizePartyEmail,
  normalizePartyInterfaceRoles,
  setPartySessionCookie,
} from '@server/partyAuth'
import { getPartyAuthInfrastructureError } from '@server/partyAuthError'
import { PARTY_WORKSPACE_TYPES } from '@server/partyEntry'
import {
  exchangePartyVkCode,
  fetchPartyVkUserInfo,
  getPartyVkIdConfig,
} from '@server/partyVkIdAuth.mjs'

const errorResponse = (code, status, message) =>
  NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  )

const sameId = (first, second) => String(first || '') === String(second || '')

const getLastWorkspace = (interfaceRoles) =>
  interfaceRoles.includes(PARTY_WORKSPACE_TYPES.COMPANY)
    ? PARTY_WORKSPACE_TYPES.COMPANY
    : interfaceRoles.includes(PARTY_WORKSPACE_TYPES.PERFORMER)
      ? PARTY_WORKSPACE_TYPES.PERFORMER
      : ''

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const flow = body?.flow === 'register' ? 'register' : 'login'
  const code = String(body?.code || '').trim()
  const deviceId = String(body?.deviceId || body?.device_id || '').trim()
  const codeVerifier = String(
    body?.codeVerifier || body?.code_verifier || ''
  ).trim()
  const state = String(body?.state || '').trim()
  const suppliedAccessToken = String(
    body?.accessToken || body?.access_token || ''
  ).trim()

  if ((!code || !deviceId) && !suppliedAccessToken) {
    return errorResponse('INVALID_VK_PAYLOAD', 400, 'Некорректные данные VK ID')
  }
  if (!getPartyVkIdConfig().enabled) {
    return errorResponse(
      'VK_CONFIG_MISSING',
      503,
      'Авторизация через VK ID временно недоступна'
    )
  }

  try {
    let accessToken = suppliedAccessToken
    if (!accessToken) {
      const exchange = await exchangePartyVkCode({
        code,
        deviceId,
        codeVerifier,
        state,
      })
      if (!exchange.success) {
        const errorCode = exchange.data?.error?.type || 'VK_EXCHANGE_FAILED'
        console.error('[party/vk-auth] code exchange failed', { errorCode })
        return errorResponse(
          errorCode,
          401,
          'Не удалось подтвердить вход через VK ID'
        )
      }
      accessToken = exchange.data.accessToken
    }

    const profileResult = await fetchPartyVkUserInfo({ accessToken })
    if (!profileResult.success) {
      const errorCode = profileResult.data?.error?.type || 'VK_USERINFO_FAILED'
      console.error('[party/vk-auth] user info failed', { errorCode })
      return errorResponse(
        errorCode,
        errorCode === 'VK_PHONE_REQUIRED' ? 400 : 401,
        errorCode === 'VK_PHONE_REQUIRED'
          ? 'VK ID не передал номер телефона'
          : 'Не удалось получить профиль VK ID'
      )
    }

    const profile = profileResult.data
    const PartyUsers = await getPartyUserModel()
    const [userByVkId, userByPhone] = await Promise.all([
      PartyUsers.findOne({ vkId: profile.vkId }).lean(),
      PartyUsers.findOne({ phone: profile.phone }).lean(),
    ])

    if (userByVkId && userByPhone && !sameId(userByVkId._id, userByPhone._id)) {
      return errorResponse(
        'VK_USER_DUPLICATE_CONFLICT',
        409,
        'VK ID и номер телефона принадлежат разным аккаунтам'
      )
    }

    let user = userByVkId || userByPhone
    if (user?.status === 'archived') {
      return errorResponse(
        'VK_PROFILE_NOT_FOUND',
        404,
        'Аккаунт PartyCRM не найден'
      )
    }
    if (user?.vkId && user.vkId !== profile.vkId) {
      return errorResponse(
        'VK_USER_DUPLICATE_CONFLICT',
        409,
        'Этот номер уже связан с другим VK ID'
      )
    }
    if (flow === 'login' && !user) {
      return errorResponse(
        'VK_PROFILE_NOT_FOUND',
        404,
        'Сначала зарегистрируйтесь в PartyCRM через VK ID'
      )
    }

    const interfaceRoles = normalizePartyInterfaceRoles(body.interfaceRoles)
    if (!user) {
      if (
        body?.consentTerms !== true ||
        body?.consentPrivacyPolicy !== true ||
        body?.consentPersonalData !== true
      ) {
        return errorResponse(
          'CONSENT_REQUIRED',
          400,
          'Для регистрации необходимо принять юридические согласия'
        )
      }

      user = await PartyUsers.create({
        vkId: profile.vkId,
        phone: profile.phone,
        email: normalizePartyEmail(profile.email),
        firstName: profile.firstName,
        secondName: profile.secondName,
        registrationType: 'vk',
        interfaceRoles,
        lastWorkspace: getLastWorkspace(interfaceRoles),
        lastLoginAt: new Date(),
      })
    } else {
      const patch = {
        lastLoginAt: new Date(),
      }
      if (!user.vkId) patch.vkId = profile.vkId
      if (!user.email && profile.email)
        patch.email = normalizePartyEmail(profile.email)
      if (!user.firstName && profile.firstName)
        patch.firstName = profile.firstName
      if (!user.secondName && profile.secondName)
        patch.secondName = profile.secondName

      user = await PartyUsers.findByIdAndUpdate(
        user._id,
        { $set: patch },
        { returnDocument: 'after' }
      )
    }

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
          lastWorkspace: user.lastWorkspace || '',
        },
      },
    })
    return setPartySessionCookie(response, user)
  } catch (error) {
    if (error?.code === 11000) {
      return errorResponse(
        'VK_USER_DUPLICATE_CONFLICT',
        409,
        'Конфликт данных аккаунта. Обратитесь в поддержку'
      )
    }

    const infrastructureError = getPartyAuthInfrastructureError(error)
    console.error('[party/vk-auth] failed', {
      code: infrastructureError.code,
      name: error?.name,
    })
    return errorResponse(
      infrastructureError.code,
      infrastructureError.status,
      infrastructureError.message
    )
  }
}
