import { timingSafeEqual } from 'node:crypto'

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export const canReadPartyHealthDetails = ({ requestToken, secret }) =>
  Boolean(secret && requestToken && safeEqual(requestToken, secret))

export const buildPartyHealthPayload = ({
  product,
  databaseStatus,
  latencyMs,
  details = null,
}) => ({
  success: databaseStatus === 'ready',
  status: databaseStatus === 'ready' ? 'ok' : 'degraded',
  product,
  timestamp: new Date().toISOString(),
  uptimeSeconds: Math.floor(process.uptime()),
  database: {
    status: databaseStatus,
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
  },
  ...(details ? { details } : {}),
})
