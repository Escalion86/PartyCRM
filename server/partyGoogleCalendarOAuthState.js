const crypto = require('node:crypto')

const ALLOWED_REDIRECT_PATHS = new Set([
  '/company/settings/integrations',
  '/performer',
  '/performer/settings',
  '/performer/settings/integrations',
])
const DEFAULT_TTL_MS = 10 * 60 * 1000
const MAX_STATE_LENGTH = 4096
const STATE_ERROR_MESSAGE = 'Invalid OAuth state'
const CONFIG_ERROR_MESSAGE = 'OAuth state configuration error'

const createStateError = () => new Error(STATE_ERROR_MESSAGE)

const getNonEmptyString = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const resolvePartyGoogleCalendarOAuthStateSecret = () => {
  const nextAuthSecret = getNonEmptyString(process.env.NEXTAUTH_SECRET)
  if (nextAuthSecret) return nextAuthSecret

  if (process.env.NODE_ENV !== 'production') {
    const login = getNonEmptyString(process.env.LOGIN)
    const password = getNonEmptyString(process.env.PASSWORD)
    if (login && password) return `${login}:${password}`
  }

  throw new Error(CONFIG_ERROR_MESSAGE)
}

const resolveSecret = (secret) => {
  if (secret === undefined) return resolvePartyGoogleCalendarOAuthStateSecret()

  const resolvedSecret = getNonEmptyString(secret)
  if (!resolvedSecret) throw createStateError()
  return resolvedSecret
}

const resolveNow = (now) => {
  const value = (now || Date.now)()
  if (!Number.isFinite(value)) throw createStateError()
  return value
}

const validatePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createStateError()
  }

  const subjectType = getNonEmptyString(payload.subjectType) || 'company'
  if (!['company', 'performer'].includes(subjectType)) throw createStateError()

  for (const field of ['userId', 'nonce']) {
    if (!getNonEmptyString(payload[field])) throw createStateError()
  }
  if (subjectType === 'company' && !getNonEmptyString(payload.companyId)) {
    throw createStateError()
  }
  if (!ALLOWED_REDIRECT_PATHS.has(payload.redirectPath)) throw createStateError()
  if (!Number.isFinite(payload.expiresAt)) throw createStateError()

  return {
    ...(payload.subjectType ? { subjectType } : {}),
    companyId: getNonEmptyString(payload.companyId) || '',
    userId: payload.userId,
    redirectPath: payload.redirectPath,
    nonce: payload.nonce,
    expiresAt: payload.expiresAt,
  }
}

const sign = (encodedPayload, secret) =>
  crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')

const createPartyGoogleCalendarOAuthState = (input, options = {}) => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > DEFAULT_TTL_MS) {
    throw createStateError()
  }

  const payload = validatePayload({
    ...input,
    expiresAt: resolveNow(options.now) + ttlMs,
  })
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, resolveSecret(options.secret))

  return `${encodedPayload}.${signature}`
}

const verifyPartyGoogleCalendarOAuthState = (state, options = {}) => {
  try {
    if (typeof state !== 'string' || state.length > MAX_STATE_LENGTH) {
      throw createStateError()
    }
    const parts = state.split('.')
    if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
      throw createStateError()
    }

    const [encodedPayload, suppliedSignature] = parts
    const expectedSignature = sign(encodedPayload, resolveSecret(options.secret))
    const suppliedBuffer = Buffer.from(suppliedSignature, 'base64url')
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url')
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw createStateError()
    }

    const decodedBuffer = Buffer.from(encodedPayload, 'base64url')
    if (decodedBuffer.toString('base64url') !== encodedPayload) throw createStateError()
    const payload = validatePayload(JSON.parse(decodedBuffer.toString('utf8')))
    const currentTime = resolveNow(options.now)
    if (
      payload.expiresAt <= currentTime ||
      payload.expiresAt - currentTime > DEFAULT_TTL_MS
    ) {
      throw createStateError()
    }

    return payload
  } catch (error) {
    if (error?.message === CONFIG_ERROR_MESSAGE) throw error
    throw createStateError()
  }
}

module.exports = {
  createPartyGoogleCalendarOAuthState,
  verifyPartyGoogleCalendarOAuthState,
  resolvePartyGoogleCalendarOAuthStateSecret,
}
