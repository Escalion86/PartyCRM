export const isPartySameOriginRequest = (request) => {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const fetchSite = request.headers.get('sec-fetch-site')
  const forwardedProtocol = request.headers.get('x-forwarded-proto')

  if (
    !origin ||
    !host ||
    /[\s@/\\?#,]/.test(host) ||
    (fetchSite && fetchSite !== 'same-origin') ||
    (forwardedProtocol && !['http', 'https'].includes(forwardedProtocol))
  )
    return false

  try {
    const protocol = forwardedProtocol
      ? `${forwardedProtocol}:`
      : new URL(request.url).protocol
    return (
      ['http:', 'https:'].includes(protocol) &&
      origin === new URL(`${protocol}//${host}`).origin
    )
  } catch {
    return false
  }
}
