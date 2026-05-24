import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import { ensureVkUser } from '@server/ensureVkUser'
import { exchangeVkCode, fetchVkUserInfo } from '@server/vkIdAuth'
import { createVkIdAuthToken } from '@server/vkidAuthToken'
import getAuthSecret from '@server/getAuthSecret'

const buildError = (code, status, message) =>
  NextResponse.json(
    {
      success: false,
      error: {
        type: code,
        code,
        message,
      },
    },
    { status }
  )

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const code = String(body?.code || '').trim()
  const deviceId = String(body?.device_id || body?.deviceId || '').trim()
  const codeVerifier = String(
    body?.code_verifier || body?.codeVerifier || ''
  ).trim()
  const state = String(body?.state || '').trim()
  const accessToken = String(
    body?.access_token || body?.accessToken || ''
  ).trim()
  let idToken = String(body?.id_token || body?.idToken || '').trim()

  if ((!code || !deviceId) && !accessToken) {
    return buildError(
      'INVALID_VK_PAYLOAD',
      400,
      'Некорректные данные VK ID'
    )
  }

  try {
    let resolvedAccessToken = accessToken

    if (!resolvedAccessToken) {
      const exchangeResult = await exchangeVkCode({
        code,
        deviceId,
        codeVerifier,
        state,
      })
      if (!exchangeResult.success) {
        const errorType =
          exchangeResult.data?.error?.type || 'VK_EXCHANGE_FAILED'
        console.error('[vk-id/auth] exchange failed', {
          errorType,
          vkError: exchangeResult.data?.error?.vkError || '',
        })
        return buildError(
          errorType,
          errorType === 'VK_CONFIG_MISSING' ? 503 : 401,
          'Не удалось получить токен VK ID'
        )
      }
      resolvedAccessToken = exchangeResult.data.accessToken
      idToken = exchangeResult.data.idToken || idToken
    }

    const userInfoResult = await fetchVkUserInfo({
      accessToken: resolvedAccessToken,
      idToken,
    })
    if (!userInfoResult.success) {
      const errorType = userInfoResult.data?.error?.type || 'VK_USERINFO_FAILED'
      console.error('[vk-id/auth] user_info failed', {
        errorType,
        vkError: userInfoResult.data?.error?.vkError || '',
      })
      return buildError(
        errorType,
        errorType === 'VK_PHONE_REQUIRED' ? 400 : 401,
        errorType === 'VK_PHONE_REQUIRED'
          ? 'VK ID не передал номер телефона'
          : 'Не удалось получить профиль VK ID'
      )
    }

    await dbConnect()
    const user = await ensureVkUser({
      ...userInfoResult.data,
    })
    if (!user?._id) {
      console.error('[vk-id/auth] ensureVkUser returned empty user', {
        hasVkId: Boolean(userInfoResult.data?.vkId),
      })
      return buildError(
        'VK_USER_CREATE_FAILED',
        500,
        'Не удалось создать или найти пользователя'
      )
    }

    const authSecret = getAuthSecret()

    const authToken = createVkIdAuthToken(user._id, authSecret)
    return NextResponse.json(
      {
        success: true,
        data: {
          authToken,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const errorCode =
      error?.code === 11000
        ? 'VK_USER_DUPLICATE_CONFLICT'
        : error?.message?.includes('NEXTAUTH_SECRET')
          ? 'AUTH_SECRET_NOT_SET'
          : 'VK_ID_AUTH_FAILED'

    console.error('[vk-id/auth] error', {
      errorCode,
      message: error?.message,
      name: error?.name,
      code: error?.code,
    })

    return buildError(
      errorCode,
      500,
      'Не удалось авторизоваться через VK ID'
    )
  }
}
