import crypto from 'crypto'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { getPartyUserModel } from './partyModels'

export const PARTY_SESSION_COOKIE = 'partycrm_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

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
  return roles.length ? [...new Set(roles)] : ['company', 'performer']
}

const getSecret = () => {
  const secret =
    process.env.PARTYCRM_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SECRET
  if (!secret) {
    throw new Error('PARTYCRM_AUTH_SECRET is not configured')
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

export const getPartySessionUser = async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get(PARTY_SESSION_COOKIE)?.value
  const payload = verifyPartySessionToken(token)
  if (!payload?.uid) return null

  const PartyUsers = await getPartyUserModel()
  const user = await PartyUsers.findOne({
    _id: payload.uid,
    status: { $ne: 'archived' },
  }).lean()

  if (!user) return null

  return {
    ...user,
    _id: String(user._id),
    interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
  }
}

export const setPartySessionCookie = (response, user) => {
  response.cookies.set(PARTY_SESSION_COOKIE, createPartySessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

export const clearPartySessionCookie = (response) => {
  response.cookies.set(PARTY_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}

export const validatePartyPassword = async (password, hash) => {
  if (!password || !hash) return false
  return bcrypt.compare(password, hash)
}

export const hashPartyPassword = (password) => bcrypt.hash(password, 10)
