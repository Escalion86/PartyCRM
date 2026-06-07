export const PARTY_SITE_SETTINGS_TABS = Object.freeze([
  {
    slug: 'tariffs',
    label: 'Тарифы',
    href: '/party/site-settings/tariffs',
  },
  {
    slug: 'users',
    label: 'Пользователи',
    href: '/party/site-settings/users',
  },
  {
    slug: 'companies',
    label: 'Компании',
    href: '/party/site-settings/companies',
  },
  {
    slug: 'developer',
    label: 'Разработчик',
    href: '/party/site-settings/developer',
  },
])

export const isPartySiteSettingsPath = (pathname = '') =>
  pathname === '/party/site-settings' ||
  pathname.startsWith('/party/site-settings/')

export const canAccessPartySiteSettings = (role) => role === 'dev'
