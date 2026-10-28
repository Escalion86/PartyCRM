const objectId = /^[a-f\d]{24}$/i
const routes = new Set([
  '/company/work',
  '/performer/work',
  '/company/tasks',
  '/performer/tasks',
  '/company/inbox',
])

// Links may select an entity, but never supply another tenant or arbitrary URL.
export const partyTodayHref = (href, companyId, company = false) => {
  if (!objectId.test(String(companyId || '')) || typeof href !== 'string')
    return null
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\r\n]/.test(href))
    return null
  try {
    const url = new URL(href, 'https://partycrm.invalid')
    if (url.origin !== 'https://partycrm.invalid' || !routes.has(url.pathname))
      return null
    let path = url.pathname
    if (/^\/(company|performer)\/(work|tasks)$/.test(path))
      path = path.replace(
        /^\/(company|performer)/,
        company ? '/company' : '/performer'
      )
    const params = new URLSearchParams({ companyId: String(companyId) })
    for (const key of ['orderId', 'taskId']) {
      const value = url.searchParams.get(key)
      if (value) {
        if (!objectId.test(value)) return null
        if (
          (key === 'orderId' && !path.endsWith('/work')) ||
          (key === 'taskId' && !path.endsWith('/tasks'))
        )
          return null
        params.set(key, value.toLowerCase())
      }
    }
    return `${path}?${params}`
  } catch {
    return null
  }
}

export const partyTodayDate = (value, timeZone, { timeOnly = false } = {}) => {
  const date = new Date(value)
  if (!value || !Number.isFinite(+date)) return ''
  const options = timeOnly
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  try {
    return date.toLocaleString('ru-RU', { ...options, timeZone })
  } catch {
    return date.toLocaleString('ru-RU', options)
  }
}

export const partyTodayPhoneHref = (phone) => {
  const value = String(phone || '').replace(/[\s()+-]/g, '')
  return /^7\d{10}$/.test(value) ? `tel:+${value}` : null
}
