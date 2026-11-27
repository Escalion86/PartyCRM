import crypto from 'crypto'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import {
  PARTY_IMPERSONATION_COOKIE,
  PARTY_IMPERSONATION_UI_COOKIE,
} from '@helpers/partyImpersonationConstants'
import {
  createPartyImpersonationToken,
  readPartyImpersonationToken,
} from './partyImpersonationToken.mjs'
import { getPartyUserModel } from './partyModels'

export const PARTY_SESSION_COOKIE = 'partycrm_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export const normalizePartyPhone = (phone) => {
  if (!phone) return ''
  const digits = String(phone).replace(/[^\d]/g, '')
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

export const normalizePartyEmail = (email) =>
  String(email || '').trim().toLowerCase()

export const normalizePartyInterfaceRoles = (value) => {
  const source = Array.isArray(value) ? value : []
  const roles = source.filter((role) => ['company', 'performer'].includes(role))
  return [...new Set(roles)]
}

const getSecret = () => {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured')
  }
  return secret
}

const base64Url = (value) => Buffer.from(value).toString('base64url')

const signValue = (value) =>
  crypto.createHmac('sha256', getSecret()).update(value).digest('base64url')

const safeEqual = (first, second) => {
  const firstBuffer = Buffer.from(String(first))
  const secondBuffer = Buffer.from(String(second))
  if (firstBuffer.length !== secondBuffer.length) return false
  return crypto.timingSafeEqual(firstBuffer, secondBuffer)
}

export const createPartySessionToken = (user) => {
  const payload = base64Url(
    JSON.stringify({
      uid: String(user._id),
      phone: user.phone || '',
      iat: Date.now(),
    })
  )
  return `${payload}.${signValue(payload)}`
}

const verifyPartySessionToken = (token) => {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature) return null
  if (!safeEqual(signValue(payload), signature)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.uid) return null
    return data
  } catch {
    return null
  }
}

const normalizePartySessionUser = (user) =>
  user && {
    ...user,
    _id: String(user._id),
    interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
    lastWorkspace: ['company', 'performer'].includes(user.lastWorkspace)
      ? user.lastWorkspace
      : '',
    performerOnboardingCompletedAt: user.performerOnboardingCompletedAt || null,
  }

const findPartySessionUser = async (filter, projection) => {
  const PartyUsers = await getPartyUserModel()
  return normalizePartySessionUser(
    await PartyUsers.findOne(filter, projection).lean()
  )
}

export const canStartPartyImpersonation = (user) =>
  user?.role === 'dev' && user.status === 'active'

export const getPartyOriginalSession = async () => {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(PARTY_SESSION_COOKIE)?.value
  const impersonationActive = cookieStore.has(PARTY_IMPERSONATION_COOKIE)
  const payload = verifyPartySessionToken(sessionToken)
  const user = payload
    ? await findPartySessionUser({
        _id: payload.uid,
        status: { $ne: 'archived' },
      })
    : null
  const impersonationToken = cookieStore.get(PARTY_IMPERSONATION_COOKIE)?.value
  const impersonation =
    impersonationToken && canStartPartyImpersonation(user)
      ? readPartyImpersonationToken(impersonationToken, {
          actorId: user._id,
          sessionToken,
          secret: getSecret(),
        })
      : null

  return { user, sessionToken, impersonationActive, impersonation }
}

export const isPartyImpersonationActive = async () =>
  (await cookies()).has(PARTY_IMPERSONATION_COOKIE)

export const getPartyImpersonationTarget = (userId) =>
  findPartySessionUser({ _id: userId, status: 'active' }, { password: 0 })

const resolvePartyImpersonation = (impersonation) =>
  impersonation ? getPartyImpersonationTarget(impersonation.targetId) : null

export const getPartySessionUser = async () => {
  const { user, impersonationActive, impersonation } =
    await getPartyOriginalSession()
  return impersonationActive ? resolvePartyImpersonation(impersonation) : user
}

export const getPartyImpersonationStatus = async () => {
  if (!(await isPartyImpersonationActive())) return { active: false }

  const { impersonation } = await getPartyOriginalSession()
  const user = await resolvePartyImpersonation(impersonation)
  if (!user) return { active: true, unavailable: true }

  return {
    active: true,
    userName: [user.firstName, user.secondName].filter(Boolean).join(' ').trim(),
  }
}

export const setPartyImpersonationCookie = (
  response,
  { actorId, targetId, sessionToken }
) => {
  const token = createPartyImpersonationToken({
    actorId,
    targetId,
    sessionToken,
    secret: getSecret(),
  })

  response.cookies.set(PARTY_IMPERSONATION_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  response.cookies.set(PARTY_IMPERSONATION_UI_COOKIE, crypto.randomUUID(), {
    ...COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

export const clearPartyImpersonationCookie = (response) => {
  response.cookies.set(PARTY_IMPERSONATION_COOKIE, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  })
  response.cookies.set(PARTY_IMPERSONATION_UI_COOKIE, '', {
    ...COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: 0,
  })
  return response
}

export const setPartySessionCookie = (response, user) => {
  response.cookies.set(PARTY_SESSION_COOKIE, createPartySessionToken(user), {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return clearPartyImpersonationCookie(response)
}

export const clearPartySessionCookie = (response) => {
  response.cookies.set(PARTY_SESSION_COOKIE, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  })
  return clearPartyImpersonationCookie(response)
}

export const validatePartyPassword = async (password, hash) => {
  if (!password || !hash) return false
  return bcrypt.compare(password, hash)
}

export const hashPartyPassword = (password) => bcrypt.hash(password, 10)
