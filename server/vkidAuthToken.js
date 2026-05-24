import crypto from 'crypto'

const encodeBase64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const decodeBase64Url = (value) => {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

const signPayload = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex')

export const createVkIdAuthToken = (
  userId,
  secret,
  lifetimeMs = 5 * 60 * 1000
) => {
  if (!userId || !secret) return ''
  const payload = {
    uid: String(userId),
    exp: Date.now() + lifetimeMs,
    type: 'vkid',
  }
  const encoded = encodeBase64Url(JSON.stringify(payload))
  const signature = signPayload(encoded, secret)
  return `${encoded}.${signature}`
}

export const verifyVkIdAuthToken = (token, secret) => {
  if (!token || !secret) return null
  const [encoded, signature] = String(token).split('.')
  if (!encoded || !signature) return null
  const expected = signPayload(encoded, secret)
  if (signature !== expected) return null
  try {
    const payload = JSON.parse(decodeBase64Url(encoded))
    if (payload?.type !== 'vkid') return null
    if (!payload?.uid || !payload?.exp) return null
    if (Date.now() >= Number(payload.exp)) return null
    return payload
  } catch (error) {
    return null
  }
}

