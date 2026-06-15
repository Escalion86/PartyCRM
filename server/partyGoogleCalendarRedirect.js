const PRODUCTION_ORIGIN = 'https://partycrm.ru'

const parseOrigin = (value) => {
  const source = String(value || '').trim()
  if (!source) return ''

  try {
    const url = new URL(source)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.origin
  } catch {
    return ''
  }
}

const getPartyGoogleCalendarPublicOrigin = ({
  env = process.env,
  requestUrl = '',
} = {}) => {
  const configuredOrigins = [
    env.DOMAIN,
    env.PARTY_GOOGLE_OAUTH_REDIRECT_URI,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  ]

  for (const value of configuredOrigins) {
    const origin = parseOrigin(value)
    if (origin) return origin
  }

  if (env.NODE_ENV !== 'production') {
    const requestOrigin = parseOrigin(requestUrl)
    if (requestOrigin) return requestOrigin
  }

  return PRODUCTION_ORIGIN
}

export { getPartyGoogleCalendarPublicOrigin }
