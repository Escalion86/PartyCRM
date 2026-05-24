import crypto from 'crypto'
import dbConnect from '@server/dbConnect'
import Users from '@models/Users'
import getAuthSecret from '@server/getAuthSecret'

const decodeBase64Url = (value) => {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

/**
 * Verify a mobile JWT token and return the user context.
 * Returns { user } on success or { error, status } on failure.
 */
export const verifyMobileToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return { error: 'Empty token', status: 401 }
  }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { error: 'Invalid token format', status: 401 }
    }

    const [header, body, signature] = parts
    const secret = getAuthSecret()
    const expectedSig = crypto
      .createHmac('sha256', `${secret}`)
      .update(`${header}.${body}`)
      .digest('hex')

    if (signature !== expectedSig) {
      return { error: 'Invalid token signature', status: 401 }
    }

    const payload = JSON.parse(decodeBase64Url(body))
    if (!payload.uid || !payload.exp) {
      return { error: 'Invalid token payload', status: 401 }
    }

    if (payload.exp < Date.now()) {
      return { error: 'Token expired', status: 401 }
    }

    // Fetch fresh user data from DB
    await dbConnect()
    const user = await Users.findById(payload.uid).lean()
    if (!user) {
      return { error: 'User not found', status: 401 }
    }

    const { password: _, ...safeUser } = user

    return {
      user: {
        _id: String(safeUser._id),
        phone: safeUser.phone ?? '',
        firstName: safeUser.firstName ?? '',
        secondName: safeUser.secondName ?? '',
        email: safeUser.email ?? '',
        role: safeUser.role ?? 'user',
        tenantId: safeUser.tenantId ? String(safeUser.tenantId) : null,
        tariffId: safeUser.tariffId ? String(safeUser.tariffId) : null,
      },
    }
  } catch (err) {
    console.error('verifyMobileToken error:', err)
    return { error: 'Token verification failed', status: 401 }
  }
}

/**
 * Extract and verify mobile user from request.
 * Returns { user } or { error, status }.
 */
export const getMobileUser = async (req) => {
  const authHeader = req.headers.get('authorization') || ''
  return verifyMobileToken(authHeader)
}
