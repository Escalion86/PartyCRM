// Mobile shortcuts reuse the authorized desktop menu instead of inventing routes.
export const getPartyMobileNavItems = ({
  menu = [],
  company = false,
  canCreate = false,
} = {}) => {
  const byHref = new Map(
    menu.filter((item) => item?.href).map((item) => [item.href, item])
  )
  const prefix = company ? '/company' : '/performer'
  const work = byHref.get(`${prefix}/work`)
  const assignments = byHref.get(company ? '/company/orders' : '/performer')
  const orders = work || assignments
  const items = [
    byHref.get(`${prefix}/today`) ||
      (company
        ? byHref.get('/company') || byHref.get('/company/my-locations')
        : null),
    orders,
    orders && canCreate
      ? { href: orders.href, create: true, label: 'Создать заказ' }
      : null,
    byHref.get(`${prefix}/tasks`),
    !company ? byHref.get('/performer/reports') : null,
  ].filter(Boolean)
  const seen = new Set()
  return items
    .filter((item) => {
      const key = item.create ? 'create' : item.href
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
}

export const isPartyMobileNavItemActive = (pathname, href) =>
  pathname === href ||
  (href === '/company/orders' && pathname === '/company/orders-past') ||
  (href === '/company/work' &&
    ['/company/orders', '/company/orders-past'].includes(pathname))
