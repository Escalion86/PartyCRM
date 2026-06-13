export const COMPANY_SETTINGS_TABS = Object.freeze([
  {
    slug: 'general',
    label: 'Общие',
    href: '/company/settings',
    access: 'management',
  },
  {
    slug: 'integrations',
    label: 'Интеграции',
    href: '/company/settings/integrations',
    access: 'management',
  },
  {
    slug: 'lists',
    label: 'Списки',
    href: '/company/settings/lists',
    access: 'management',
  },
  {
    slug: 'notifications',
    label: 'Уведомления',
    href: '/company/settings/notifications',
    access: 'management',
  },
  {
    slug: 'documents',
    label: 'Документы',
    href: '/company/settings/documents',
    access: 'management',
  },
  {
    slug: 'tariffs',
    label: 'Тарифы',
    href: '/company/settings/tariffs',
    access: 'management',
  },
])

export const DEFAULT_COMPANY_SETTINGS_TAB = 'general'
export const COMPANY_SETTINGS_ACCESS = Object.freeze({
  PUBLIC: 'public',
  MANAGEMENT: 'management',
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
  const { companyRole, isCompanyManager } = normalizeAccessContext(context)
  if (access === COMPANY_SETTINGS_ACCESS.MANAGEMENT) {
    return isCompanyManager || isCompanyManagerRole(companyRole)
  }
  if (access === COMPANY_SETTINGS_ACCESS.DEV) {
    return false
  }
  if (access === COMPANY_SETTINGS_ACCESS.ADMIN_DEV) {
    return isCompanyManager || isCompanyManagerRole(companyRole)
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
