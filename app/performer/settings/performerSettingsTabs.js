export const PERFORMER_SETTINGS_TABS = Object.freeze([
  {
    slug: 'profile',
    label: 'Профиль',
    href: '/performer/settings',
  },
  {
    slug: 'integrations',
    label: 'Интеграции',
    href: '/performer/settings/integrations',
  },
  {
    slug: 'notifications',
    label: 'Уведомления',
    href: '/performer/settings/notifications',
  },
])

export const DEFAULT_PERFORMER_SETTINGS_TAB = 'profile'

export const getPerformerSettingsTab = (slug) => {
  if (!slug) return DEFAULT_PERFORMER_SETTINGS_TAB
  return PERFORMER_SETTINGS_TABS.some((item) => item.slug === slug)
    ? slug
    : null
}

export const getPerformerSettingsHref = (slug) =>
  slug === DEFAULT_PERFORMER_SETTINGS_TAB
    ? '/performer/settings'
    : `/performer/settings/${slug}`
