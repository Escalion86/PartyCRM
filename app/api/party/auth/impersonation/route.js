import { NextResponse } from 'next/server'
import { PARTY_IMPERSONATION_RETURN_PATH } from '@helpers/partyImpersonationConstants'
import {
  canStartPartyImpersonation,
  clearPartyImpersonationCookie,
  getPartyImpersonationStatus,
  getPartyImpersonationTarget,
  getPartyOriginalSession,
  setPartyImpersonationCookie,
} from '@server/partyAuth'
import { getPartyAuthInfrastructureError } from '@server/partyAuthError'
import { isPartyUserId } from '@server/partyImpersonationToken.mjs'
import { isPartySameOriginRequest } from '@server/partySameOrigin.mjs'

export const dynamic = 'force-dynamic'

const json = (body, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const failure = (error, status) => json({ success: false, error }, status)

const infrastructureFailure = (error) => {
  const { code, status } = getPartyAuthInfrastructureError(error)
  console.error('PartyCRM impersonation request failed', { code })
  return failure('Не удалось проверить вход от лица пользователя', status)
}

export async function GET() {
  try {
    return json({ success: true, data: await getPartyImpersonationStatus() })
  } catch (error) {
    return infrastructureFailure(error)
  }
}

export async function POST(request) {
  if (!isPartySameOriginRequest(request)) return failure('Запрос отклонён', 403)

  try {
    const { user, sessionToken, impersonationActive } =
      await getPartyOriginalSession()
    if (!user) return failure('Войдите в аккаунт', 401)
    if (!canStartPartyImpersonation(user))
      return failure('Вход от лица пользователя доступен разработчику', 403)
    if (impersonationActive)
      return failure('Сначала вернитесь в свой аккаунт', 409)

    const { userId } = (await request.json().catch(() => null)) ?? {}
    if (!isPartyUserId(userId)) return failure('Укажите пользователя', 400)
    if (userId.toLowerCase() === user._id)
      return failure('Вы уже в своём аккаунте', 400)

    const target = await getPartyImpersonationTarget(userId)
    if (!target) return failure('Аккаунт недоступен для входа', 404)

    const response = setPartyImpersonationCookie(
      json({ success: true, data: { redirectTo: '/party/entry' } }),
      { actorId: user._id, targetId: target._id, sessionToken }
    )

    console.info('PartyCRM impersonation started', {
      actorId: user._id,
      targetId: target._id,
    })
    return response
  } catch (error) {
    return infrastructureFailure(error)
  }
}

export async function DELETE(request) {
  if (!isPartySameOriginRequest(request)) return failure('Запрос отклонён', 403)

  let redirectTo = '/party/login'
  try {
    const { user, impersonationActive, impersonation } =
      await getPartyOriginalSession()
    if (canStartPartyImpersonation(user)) {
      redirectTo = PARTY_IMPERSONATION_RETURN_PATH
    } else if (user?.status === 'active') {
      redirectTo = '/party/entry'
    }

    if (impersonationActive) {
      console.info('PartyCRM impersonation ended', {
        actorId: user?._id ?? null,
        targetId: impersonation?.targetId ?? null,
      })
    }
  } catch (error) {
    const { code } = getPartyAuthInfrastructureError(error)
    console.error('PartyCRM impersonation cleanup failed', { code })
  }

  return clearPartyImpersonationCookie(
    json({ success: true, data: { redirectTo } })
  )
}
