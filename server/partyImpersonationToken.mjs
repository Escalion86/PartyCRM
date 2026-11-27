import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const isPartyUserId = (value) =>
  typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)

const digestSession = (sessionToken) =>
  createHash('sha256').update(sessionToken).digest('base64url')

const signImpersonation = (payload, secret) =>
  createHmac('sha256', secret)
    .update(`partycrm-impersonation:v2:${payload}`)
    .digest('base64url')

const secureEqual = (actual, expected) => {
  if (typeof actual !== 'string') return false
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  )
}

export const createPartyImpersonationToken = ({
  actorId,
  targetId,
  sessionToken,
  secret,
}) => {
  const payload = Buffer.from(
    JSON.stringify({
      actorId,
      targetId,
      sessionDigest: digestSession(sessionToken),
    })
  ).toString('base64url')

  return `${payload}.${signImpersonation(payload, secret)}`
}

export const readPartyImpersonationToken = (
  token,
  { actorId, sessionToken, secret }
) => {
  if (typeof token !== 'string' || token.length > 1024 || !sessionToken)
    return null

  const parts = token.split('.')
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)))
    return null

  const [payload, signature] = parts
  if (!secureEqual(signature, signImpersonation(payload, secret))) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (
      data?.actorId !== actorId ||
      !isPartyUserId(data.targetId) ||
      data.targetId.toLowerCase() === actorId.toLowerCase() ||
      !secureEqual(data.sessionDigest, digestSession(sessionToken))
    )
      return null

    return { targetId: data.targetId }
  } catch {
    return null
  }
}
