export const COMPANY_SETTINGS_TABS = Object.freeze([
  {
    slug: 'general',
    label: 'Общие',
    href: '/company/settings',
    access: 'public',
  },
  {
    slug: 'integrations',
    label: 'Интеграции',
    href: '/company/settings/integrations',
    access: 'admin-dev',
  },
  {
    slug: 'lists',
    label: 'Списки',
    href: '/company/settings/lists',
    access: 'public',
  },
  {
    slug: 'notifications',
    label: 'Уведомления',
    href: '/company/settings/notifications',
    access: 'admin-dev',
  },
  {
    slug: 'documents',
    label: 'Документы',
    href: '/company/settings/documents',
    access: 'admin-dev',
  },
  {
    slug: 'tariffs',
    label: 'Тарифы',
    href: '/company/settings/tariffs',
    access: 'admin-dev',
  },
])

export const DEFAULT_COMPANY_SETTINGS_TAB = 'general'
export const COMPANY_SETTINGS_ACCESS = Object.freeze({
  PUBLIC: 'public',
  ADMIN_DEV: 'admin-dev',
  DEV: 'dev',
})

const normalizeGlobalRole = (role) => String(role || '').trim().toLowerCase()

const normalizeCompanyRole = (role) => String(role || '').trim().toLowerCase()

const normalizeAccessContext = (context) => {
  if (typeof context === 'string') {
    return {
      globalRole: normalizeGlobalRole(context),
      companyRole: '',
      isCompanyManager: false,
    }
  }

  return {
    globalRole: normalizeGlobalRole(context?.globalRole ?? context?.role),
    companyRole: normalizeCompanyRole(context?.companyRole),
    isCompanyManager: Boolean(context?.isCompanyManager),
  }
}

const isCompanyManagerRole = (role) => ['owner', 'admin'].includes(role)

export const canAccessCompanySettingsAccessLevel = (access, context) => {
  const { globalRole, companyRole, isCompanyManager } =
    normalizeAccessContext(context)
  if (access === COMPANY_SETTINGS_ACCESS.DEV) {
    return globalRole === 'dev'
  }
  if (access === COMPANY_SETTINGS_ACCESS.ADMIN_DEV) {
    return (
      globalRole === 'admin' ||
      globalRole === 'dev' ||
      isCompanyManager ||
      isCompanyManagerRole(companyRole)
    )
  }
  return true
}

export const getCompanySettingsTab = (slug) => {
  if (!slug) return DEFAULT_COMPANY_SETTINGS_TAB
  return COMPANY_SETTINGS_TABS.some((item) => item.slug === slug) ? slug : null
}

export const getCompanySettingsHref = (slug) =>
  slug === DEFAULT_COMPANY_SETTINGS_TAB
    ? '/company/settings'
    : `/company/settings/${slug}`

export const getCompanySettingsTabConfig = (slug) =>
  COMPANY_SETTINGS_TABS.find((item) => item.slug === slug) || null

export const canAccessCompanySettingsTab = (slug, context) => {
  const tab = getCompanySettingsTabConfig(slug)
  if (!tab) return false
  return canAccessCompanySettingsAccessLevel(tab.access, context)
}

export const getVisibleCompanySettingsTabs = (context) =>
  COMPANY_SETTINGS_TABS.filter((item) =>
    canAccessCompanySettingsAccessLevel(item.access, context)
  )
