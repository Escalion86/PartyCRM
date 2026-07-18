const DEFAULT_APP_ID = '54681802'
const DEFAULT_REDIRECT_URI = 'https://partycrm.ru'
const DEFAULT_SCOPE = 'phone email'

const getBaseUrl = () =>
  String(process.env.PARTY_VK_ID_BASE_URL || 'https://id.vk.ru').replace(
    /\/$/,
    ''
  )

const firstValue = (...values) =>
  values.find((value) => value !== null && value !== undefined && value !== '')

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8'))
    return `7${digits.slice(1)}`
  return digits
}

const normalizeEmail = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

const result = (success, data) => ({ success, data })

const errorResult = (type, message, details = {}) =>
  result(false, { error: { type, message, ...details } })

const formBody = (values = {}) => {
  const form = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    form.append(key, String(value))
  })
  return form
}

const vkRequest = async ({ path, query = {}, body = {} }) => {
  const url = new URL(`${getBaseUrl()}${path}`)
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(body),
    cache: 'no-store',
  })
  const json = await response.json().catch(() => ({}))
  return { response, json }
}

export const getPartyVkIdConfig = () => {
  const appId = String(process.env.PARTY_VK_ID_APP_ID || DEFAULT_APP_ID).trim()
  const clientSecret = String(
    process.env.PARTY_VK_ID_CLIENT_SECRET || ''
  ).trim()
  const redirectUri = String(
    process.env.PARTY_VK_ID_REDIRECT_URI || DEFAULT_REDIRECT_URI
  ).trim()
  const scope = String(
    process.env.NEXT_PUBLIC_PARTY_VK_ID_SCOPE || DEFAULT_SCOPE
  ).trim()

  return {
    appId,
    clientSecret,
    redirectUri,
    scope,
    enabled:
      process.env.PARTY_VK_AUTH_ENABLED === 'true' &&
      Boolean(appId) &&
      Boolean(clientSecret) &&
      Boolean(redirectUri),
  }
}

export const exchangePartyVkCode = async ({
  code,
  deviceId,
  codeVerifier,
  state,
} = {}) => {
  const config = getPartyVkIdConfig()
  if (!config.enabled) {
    return errorResult(
      'VK_CONFIG_MISSING',
      'VK ID is not configured for PartyCRM'
    )
  }
  if (!code || !deviceId) {
    return errorResult('INVALID_VK_PAYLOAD', 'VK ID payload is incomplete')
  }

  const { response, json } = await vkRequest({
    path: '/oauth2/auth',
    query: {
      client_id: config.appId,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      device_id: deviceId,
      state: state || 'partycrm_vkid_state',
      code_verifier: codeVerifier,
    },
    body: { code },
  })

  if (!response.ok || json?.error) {
    return errorResult('VK_EXCHANGE_FAILED', 'VK ID code exchange failed', {
      vkError: json?.error || '',
    })
  }

  if (state && json?.state !== state) {
    return errorResult('VK_STATE_MISMATCH', 'VK ID state mismatch')
  }

  const accessToken = json?.access_token || json?.accessToken || ''
  if (!accessToken) {
    return errorResult('VK_EXCHANGE_FAILED', 'VK ID token is missing')
  }

  return result(true, {
    accessToken,
    idToken: json?.id_token || json?.idToken || '',
  })
}

export const fetchPartyVkUserInfo = async ({ accessToken } = {}) => {
  const config = getPartyVkIdConfig()
  if (!config.enabled) {
    return errorResult(
      'VK_CONFIG_MISSING',
      'VK ID is not configured for PartyCRM'
    )
  }
  if (!accessToken) {
    return errorResult('INVALID_VK_PAYLOAD', 'VK ID access token is missing')
  }

  const { response, json } = await vkRequest({
    path: '/oauth2/user_info',
    query: { client_id: config.appId },
    body: { access_token: accessToken },
  })

  if (!response.ok || json?.error) {
    return errorResult('VK_USERINFO_FAILED', 'VK ID user info request failed', {
      vkError: json?.error || '',
    })
  }

  const user = json?.user || json?.data?.user || json?.data || json || {}
  const vkId = String(
    firstValue(
      user?.user_id,
      user?.id,
      user?.sub,
      json?.user_id,
      json?.id,
      json?.sub
    ) || ''
  ).trim()
  const phone = normalizePhone(
    firstValue(
      user?.phone,
      user?.phone_number,
      json?.phone,
      json?.phone_number,
      json?.data?.phone,
      json?.data?.phone_number
    )
  )

  if (!vkId) {
    return errorResult('VK_PROFILE_INVALID', 'VK ID profile has no user id')
  }
  if (phone.length !== 11 || !phone.startsWith('7')) {
    return errorResult('VK_PHONE_REQUIRED', 'VK ID profile has no phone number')
  }

  return result(true, {
    vkId,
    phone,
    email: normalizeEmail(firstValue(user?.email, json?.email)),
    firstName: String(user?.first_name || user?.firstName || '')
      .trim()
      .slice(0, 100),
    secondName: String(user?.last_name || user?.lastName || '')
      .trim()
      .slice(0, 100),
  })
}
