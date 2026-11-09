'use client'

import {
  faAddressBook,
  faAngleDown,
  faBriefcase,
  faCalendarCheck,
  faCalendarDay,
  faChartLine,
  faChartColumn,
  faGear,
  faHome,
  faLocationDot,
  faPhone,
  faInbox,
  faBoxesStacked,
  faRightFromBracket,
  faStar,
  faUserGroup,
  faUserTie,
  faClockRotateLeft,
  faTicket,
  faPlus,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  COMPANY_SETTINGS_ACCESS,
  getVisibleCompanySettingsTabs,
} from '../../app/company/settings/companySettingsTabs'
import { PERFORMER_SETTINGS_TABS } from '../../app/performer/settings/performerSettingsTabs'
import {
  PARTY_SITE_SETTINGS_TABS,
  canAccessPartySiteSettings,
  isPartySiteSettingsPath,
} from '../../app/party/site-settings/siteSettingsNav'
import cn from 'classnames'
import Link from 'next/link'
import PartyMobileNav from './PartyMobileNav'
import PartyUnsavedChangesBootstrap from './navigation/PartyUnsavedChangesBootstrap'
import {
  requestPartyLeave,
  allowPartyNavigation,
} from './navigation/partyUnsavedChangesRuntime'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canPartyOperationalPermission } from '@helpers/partyOperationalPermissions'
import {
  canPartyAccess,
  isPartyRestrictedManagementContext,
} from '@helpers/partyRolePermissions'
import { getPartyMobileNavItems } from '@helpers/partyMobileNavigation'
import { getPartyNavigationGroups } from '@helpers/partyNavigationGroups'
import { isPartyTicketingEnabled } from '@helpers/partyTicketing'
import { canPartyTodayAccess } from '@helpers/partyToday'
import { canPartyResourceCalendarAccess } from '@helpers/partyResourceCalendar'
import {
  PARTY_ACTIVE_COMPANY_STORAGE_KEY as ACTIVE_COMPANY_STORAGE_KEY,
  PARTY_ACTIVE_COMPANY_EVENT,
  readPartyActiveCompanyId,
} from '@helpers/partyActiveCompany'

const companyMenu = [
  { href: '/company/today', label: 'Сегодня', icon: faCalendarDay, today: true },
  { href: '/company', label: 'Обзор', icon: faHome },
  {
    href: '/company/tasks',
    label: 'Задачи',
    icon: faCalendarCheck,
    resource: 'tasks',
  },
  {
    href: '/company/work',
    label: 'Заказы',
    icon: faBriefcase,
    resource: 'orders',
  },
  {
    href: '/company/resources',
    label: 'Ресурсы',
    icon: faCalendarDay,
    resourceCalendar: true,
  },
  {
    href: '/company/ticketing',
    label: 'Билеты и посещения',
    icon: faTicket,
    resource: 'tickets',
    ticketing: true,
  },
  { href: '/company/calls', label: 'Звонки', icon: faPhone },
  {
    href: '/company/inbox',
    label: 'Входящие',
    icon: faInbox,
    managementOnly: true,
  },
  { href: '/company/clients', label: 'Клиенты', icon: faAddressBook },
  { href: '/company/finance', label: 'Финансы', icon: faChartLine },
  {
    href: '/company/payroll',
    label: 'Ведомости выплат',
    icon: faBriefcase,
    managementOnly: true,
  },
  { href: '/company/statistics', label: 'Статистика', icon: faChartColumn },
  { href: '/company/services', label: 'Услуги', icon: faStar },
  {
    href: '/company/inventory',
    label: 'Склад',
    icon: faBoxesStacked,
    managementOnly: true,
  },
  { href: '/company/locations', label: 'Точки', icon: faLocationDot },
  { href: '/company/staff', label: 'Сотрудники', icon: faUserGroup },
  {
    href: '/company/audit',
    label: 'История действий',
    icon: faClockRotateLeft,
    managementOnly: true,
  },
  { href: '/company/settings', label: 'Настройки компании', icon: faGear },
]

const ordersSubMenu = [
  {
    href: '/company/orders',
    label: 'Предстоящие',
    access: COMPANY_SETTINGS_ACCESS.PUBLIC,
  },
  {
    href: '/company/orders-past',
    label: 'Прошедшие',
    access: COMPANY_SETTINGS_ACCESS.PUBLIC,
  },
]

const performerMenu = [
  { href: '/performer/today', label: 'Сегодня', icon: faCalendarDay, today: true },
  {
    href: '/performer/tasks',
    label: 'Задачи',
    icon: faCalendarCheck,
    resource: 'tasks',
  },
  {
    href: '/performer/work',
    label: 'Заказы',
    icon: faBriefcase,
    resource: 'orders',
  },
  {
    href: '/performer/resources',
    label: 'Ресурсы',
    icon: faCalendarDay,
    resourceCalendar: true,
  },
  {
    href: '/performer/ticketing',
    label: 'Билеты и посещения',
    icon: faTicket,
    resource: 'tickets',
    ticketing: true,
  },
  {
    href: '/performer/reports',
    label: 'Проверка отчётов',
    icon: faCalendarCheck,
    resource: 'reports',
  },
  {
    href: '/performer/library',
    label: 'Опыт команды',
    icon: faStar,
    resource: 'reports.creative',
  },
  {
    href: '/performer/inventory',
    label: 'Выдача реквизита',
    icon: faBoxesStacked,
    permission: 'inventory.movements',
  },
  {
    href: '/performer/pricing',
    label: 'Стоимость заказов',
    icon: faChartLine,
    permission: 'orders.pricing',
  },
  {
    href: '/performer/team',
    label: 'Команда заказов',
    icon: faUserGroup,
    permission: 'orders.assignments',
  },
  { href: '/performer/settings', label: 'Настройки кабинета', icon: faGear },
  {
    href: '/company/settings',
    label: 'Настройки компании',
    icon: faGear,
    managementOnly: true,
  },
]

const locationOwnerMenu = [
  { href: '/company/today', label: 'Сегодня', icon: faCalendarDay, today: true },
  { href: '/company/my-locations', label: 'Мои площадки', icon: faLocationDot },
  {
    href: '/company/resources',
    label: 'Ресурсы',
    icon: faCalendarDay,
    resourceCalendar: true,
  },
  {
    href: '/company/tasks',
    label: 'Задачи',
    icon: faCalendarCheck,
    resource: 'tasks',
  },
  {
    href: '/company/work',
    label: 'Заказы',
    icon: faBriefcase,
    resource: 'orders',
  },
  {
    href: '/company/ticketing',
    label: 'Билеты и посещения',
    icon: faTicket,
    resource: 'tickets',
    ticketing: true,
  },
]

const secondaryMenu = [
  { href: '/company', label: 'Кабинет компании', icon: faBriefcase },
  {
    href: '/performer',
    label: 'Мои назначения',
    icon: faUserTie,
    performerOnly: true,
  },
  { href: '/party/settings', label: 'Личные настройки', icon: faGear, always: true },
]

const getDisplayName = (user) =>
  [user?.firstName, user?.secondName].filter(Boolean).join(' ').trim()

const isCompanySettingsPath = (pathname = '') =>
  pathname === '/company/settings' || pathname.startsWith('/company/settings/')

const isPerformerSettingsPath = (pathname = '') =>
  pathname === '/performer/settings' ||
  pathname.startsWith('/performer/settings/')

const MenuLink = ({ item, active, onClick }) => (
  <Link
    href={item.href}
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={cn(
      'flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200',
      active
        ? 'bg-sky-700 text-white'
        : 'text-white/80 hover:bg-white/10 hover:text-white'
    )}
  >
    <FontAwesomeIcon icon={item.icon} className="h-4 w-4 min-w-4" />
    <span className="min-w-0 flex-1 break-words">{item.label}</span>
  </Link>
)

const MenuGroupButton = ({ item, active, open, onClick, controls }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={open}
    aria-controls={open ? controls : undefined}
    className={cn(
      'flex min-h-11 min-w-0 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200',
      active
        ? 'bg-sky-700 text-white'
        : 'text-white/80 hover:bg-white/10 hover:text-white'
    )}
  >
    <FontAwesomeIcon icon={item.icon} className="h-4 w-4 min-w-4" />
    <span className="min-w-0 flex-1 break-words text-left">{item.label}</span>
    {item.access === COMPANY_SETTINGS_ACCESS.DEV ? <span className="text-purple-300" aria-label="Только разработчик">*</span> : null}
    <FontAwesomeIcon
      icon={faAngleDown}
      className={cn('h-3.5 w-3.5 min-w-3.5 transition-transform', {
        'rotate-180': open,
      })}
    />
  </button>
)

const SubMenuLink = ({ item, active, onClick }) => (
  <Link
    href={item.href}
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={cn(
      'ml-6 flex min-h-11 min-w-0 items-center gap-2 rounded-md border-l px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200',
      active
        ? 'border-sky-300 bg-white/10 text-sky-100'
        : 'border-white/10 text-white/65 hover:border-white/25 hover:bg-white/6 hover:text-white'
    )}
  >
    <span className="truncate">{item.label}</span>
    {item.access === COMPANY_SETTINGS_ACCESS.DEV ? <span className="text-purple-300" aria-label="Только разработчик">*</span> : null}
  </Link>
)

function NavigationGroup({ group, active, children }) {
  return (
    <details open={group.id === 'work' || active} className="group min-w-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-200 [&::-webkit-details-marker]:hidden">
        {group.label}
        <FontAwesomeIcon icon={faAngleDown} className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1 grid min-w-0 gap-1">{children}</div>
    </details>
  )
}

export default function PartyAppShell({ variant = 'company', children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenu = useRef(null)
  const menuReturnFocus = useRef(null)
  useEffect(() => {
    if (!mobileMenuOpen) return
    menuReturnFocus.current = document.activeElement
    const frame = requestAnimationFrame(() => {
      mobileMenu.current?.querySelector('a, button, summary')?.focus()
    })
    const escape = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMobileMenuOpen(false)
      menuReturnFocus.current?.focus()
    }
    const resized = () => {
      if (window.matchMedia('(min-width: 768px)').matches) setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('resize', resized)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('resize', resized)
    }
  }, [mobileMenuOpen])
  const [companySettingsExpanded, setCompanySettingsExpanded] = useState(null)
  const [performerSettingsExpanded, setPerformerSettingsExpanded] =
    useState(null)
  const [siteSettingsExpanded, setSiteSettingsExpanded] = useState(null)
  const [ordersExpanded, setOrdersExpanded] = useState(null)
  const [currentHash, setCurrentHash] = useState('')
  const [interfaceRoles, setInterfaceRoles] = useState([])
  const [partyUser, setPartyUser] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [activeCompanyId, setActiveCompanyId] = useState('')
  const pendingCompanyId = useRef('')
  const effectiveVariant = useMemo(() => {
    if (variant === 'company' && isCompanySettingsPath(pathname || '')) {
      return 'company-settings'
    }
    return variant
  }, [pathname, variant])
  const canUseCompany =
    interfaceRoles.includes('company') ||
    memberships.some(
      (membership) =>
        membership.role === 'location_owner' && membership.status === 'active'
    )
  const canUsePerformer = interfaceRoles.includes('performer')
  const canUseBoth = canUseCompany && canUsePerformer
  const activeMembership =
    memberships.find((item) => item.tenantId === activeCompanyId) ||
    memberships[0] ||
    null
  const companySettingsActive = isCompanySettingsPath(pathname || '')
  const companySettingsOpen = companySettingsExpanded ?? companySettingsActive
  const performerSettingsActive = isPerformerSettingsPath(pathname || '')
  const performerSettingsOpen =
    performerSettingsExpanded ?? performerSettingsActive
  const siteSettingsActive = isPartySiteSettingsPath(pathname || '')
  const siteSettingsOpen = siteSettingsExpanded ?? siteSettingsActive
  const ordersActive =
    pathname === '/company/orders' || pathname === '/company/orders-past'
  const ordersOpen = ordersExpanded ?? ordersActive
  const visibleCompanySettingsMenu = useMemo(
    () =>
      getVisibleCompanySettingsTabs({
        globalRole: partyUser?.role,
        companyRole: activeMembership?.role,
        isCompanyManager: activeMembership?.isAdmin,
      }),
    [activeMembership?.isAdmin, activeMembership?.role, partyUser?.role]
  )
  const canUseSiteSettings = canAccessPartySiteSettings(partyUser?.role)
  const isCompanyVariant =
    effectiveVariant === 'company' || effectiveVariant === 'company-settings'
  const mobileCompany =
    isCompanyVariant || (effectiveVariant === 'settings' && canUseCompany)
  const legacyCompanyAllowed =
    activeMembership?.status === 'active' &&
    activeMembership?.isAdmin &&
    !isPartyRestrictedManagementContext(activeMembership)
  const visibleCompanyMenu = companyMenu.filter(
    (item) =>
      (legacyCompanyAllowed ||
        ['/company/today', '/company/work', '/company/tasks', '/company/ticketing', '/company/resources'].includes(
          item.href
        ) ||
        (item.href === '/company/settings' &&
          activeMembership?.status === 'active' &&
          activeMembership?.isAdmin)) &&
      (!item.ticketing || isPartyTicketingEnabled(activeMembership?.company)) &&
      (!item.managementOnly || activeMembership?.isAdmin) &&
      (!item.today || canPartyTodayAccess(activeMembership)) &&
      (!item.resourceCalendar || canPartyResourceCalendarAccess(activeMembership)) &&
      (!item.resource ||
        (activeMembership &&
          canPartyAccess(
            {
              ...activeMembership,
              staff: activeMembership.staff,
              position: activeMembership.position,
            },
            { resource: item.resource }
          )))
  )
  const visiblePerformerMenu = performerMenu.filter(
    (item) =>
      (item.href !== '/performer' || canUsePerformer) &&
      (!item.today || memberships.some((membership) => canPartyTodayAccess(membership))) &&
      (!item.resourceCalendar || memberships.some((membership) => canPartyResourceCalendarAccess(membership))) &&
      (!item.ticketing ||
        (isPartyTicketingEnabled(activeMembership?.company) &&
          activeMembership &&
          canPartyAccess(activeMembership, { resource: 'tickets' }))) &&
      (!item.managementOnly ||
        memberships.some(
          (membership) => membership.status === 'active' && membership.isAdmin
        )) &&
      (!item.resource ||
        memberships.some((membership) =>
          canPartyAccess(
            {
              ...membership,
              staff: membership.staff,
              position: membership.position,
            },
            { resource: item.resource }
          )
        )) &&
      (!item.permission ||
        memberships.some((membership) =>
          canPartyOperationalPermission(membership, item.permission)
        ))
  )
  const primaryMenu =
    (activeMembership?.role === 'location_owner' && isCompanyVariant) ||
    pathname === '/company/my-locations'
      ? locationOwnerMenu.filter(
          (item) =>
            (!item.today || canPartyTodayAccess(activeMembership)) &&
            (!item.resourceCalendar || canPartyResourceCalendarAccess(activeMembership)) &&
            (!item.ticketing ||
              isPartyTicketingEnabled(activeMembership?.company)) &&
            (!item.resource ||
              (activeMembership &&
                canPartyAccess(activeMembership, { resource: item.resource })))
        )
      : effectiveVariant === 'performer'
        ? visiblePerformerMenu
        : effectiveVariant === 'settings'
          ? canUseCompany
            ? visibleCompanyMenu
            : canUsePerformer
              ? visiblePerformerMenu
              : []
          : effectiveVariant === 'company-settings'
            ? visibleCompanyMenu
            : visibleCompanyMenu
  const mobileNavItems = getPartyMobileNavItems({
    menu: primaryMenu,
    company: mobileCompany,
    preferWork:
      [
        '/company/work',
        '/performer/work',
        '/company/tasks',
        '/performer/tasks',
        '/company/today',
        '/performer/today',
        '/company/resources',
        '/performer/resources',
      ].includes(pathname) ||
      (!legacyCompanyAllowed && !canUsePerformer),
    canCreate: Boolean(
      activeMembership &&
      canPartyAccess(activeMembership, { resource: 'orders', action: 'create' })
    ),
  })
  const navigationGroups = getPartyNavigationGroups(primaryMenu)
  const createItem = mobileNavItems.find((item) => item.create)
  const visibleSecondaryMenu = secondaryMenu.filter((item) => {
    if (item.always) return true
    if (item.performerOnly) return profileLoaded && canUsePerformer
    if (!profileLoaded || !canUseBoth) return false
    if (item.href === '/company') return canUseCompany
    if (item.href === '/performer') return canUsePerformer
    return true
  })
  const title = (() => {
    if (variant === 'performer') {
      const performerName = getDisplayName(partyUser)
      const positionTitle = activeMembership?.position?.title || 'Сотрудник'
      return performerName
        ? `${positionTitle}: ${performerName}`
        : positionTitle
    }

    if (effectiveVariant === 'settings') return 'Настройки'
    if (siteSettingsActive) return 'Настройка сайта'
    if (effectiveVariant === 'company-settings') return 'Настройки компании'

    const companyTitle = activeMembership?.company?.title || ''
    return companyTitle ? `Компания "${companyTitle}"` : 'Компания'
  })()

  useEffect(() => {
    const syncCompany = (event) => {
      if (event?.detail?.companyId) pendingCompanyId.current = String(event.detail.companyId)
      const explicitId = pendingCompanyId.current
      const companyId = String(
        memberships.some((membership) => String(membership.tenantId) === explicitId)
          ? explicitId
          : readPartyActiveCompanyId(memberships)
      )
      if (
        memberships.some(
          (membership) => String(membership.tenantId) === companyId
        )
      )
        {
          pendingCompanyId.current = companyId
          setActiveCompanyId(companyId)
        }
    }
    const syncStoredCompany = (event) => {
      if (event.key === ACTIVE_COMPANY_STORAGE_KEY) syncCompany({ detail: { companyId: event.newValue } })
    }
    syncCompany()
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, syncCompany)
    window.addEventListener('storage', syncStoredCompany)
    return () => {
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, syncCompany)
      window.removeEventListener('storage', syncStoredCompany)
    }
  }, [memberships])

  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash || '')
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  useEffect(() => {
    const loadProfile = () => {
      Promise.all([
        fetch('/api/party/auth/me', { cache: 'no-store' }).then((response) =>
          response.ok ? response.json() : null
        ),
        fetch('/api/party/memberships', { cache: 'no-store' }).then(
          (response) => (response.ok ? response.json() : null)
        ),
      ])
        .then(([profilePayload, membershipsPayload]) => {
          const roles = profilePayload?.data?.user?.interfaceRoles
          setPartyUser(profilePayload?.data?.user || null)
          setMemberships(membershipsPayload?.data?.memberships || [])
          if (Array.isArray(roles) && roles.length > 0) {
            setInterfaceRoles(roles)
          } else {
            setInterfaceRoles([])
          }
          setProfileLoaded(true)
        })
        .catch(() => {
          setPartyUser(null)
          setMemberships([])
          setInterfaceRoles([])
          setProfileLoaded(true)
        })
    }

    loadProfile()
    window.addEventListener('partycrm:profile-updated', loadProfile)
    return () => {
      window.removeEventListener('partycrm:profile-updated', loadProfile)
    }
  }, [])

  useEffect(() => {
    if (!profileLoaded) return
    // These workspaces verify their membership on the server in either UI mode.
    if (
      [
        '/company/tasks',
        '/performer/tasks',
        '/company/work',
        '/performer/work',
        '/company/ticketing',
        '/performer/ticketing',
        '/company/today',
        '/performer/today',
        '/company/resources',
        '/performer/resources',
      ].includes(pathname)
    )
      return
    if (
      activeMembership?.role === 'location_owner' &&
      isCompanyVariant &&
      pathname !== '/company/my-locations'
    ) {
      allowPartyNavigation('/company/my-locations')
      router.replace('/company/my-locations')
      return
    }
    if (
      effectiveVariant === 'settings' ||
      effectiveVariant === 'company-settings'
    )
      return
    if (effectiveVariant === 'performer' && canUseCompany && !canUsePerformer) {
      allowPartyNavigation('/company')
      router.replace('/company')
      return
    }
    if (effectiveVariant !== 'performer' && canUsePerformer && !canUseCompany) {
      allowPartyNavigation('/performer')
      router.replace('/performer')
    }
  }, [
    activeMembership?.role,
    isCompanyVariant,
    pathname,
    canUseCompany,
    canUsePerformer,
    effectiveVariant,
    profileLoaded,
    router,
  ])

  useEffect(() => {
    if (!profileLoaded) return
    if (!['company', 'performer'].includes(effectiveVariant)) return

    fetch('/api/party/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastWorkspace: effectiveVariant }),
    })
      .then(() => {
        window.dispatchEvent(new Event('partycrm:profile-updated'))
      })
      .catch(() => null)
  }, [effectiveVariant, profileLoaded])

  const isActive = (href) => {
    const [path, hash] = href.split('#')
    if (
      href === '/company/work' &&
      ['/company/work', '/company/orders', '/company/orders-past'].includes(
        pathname
      )
    )
      return true
    if (href === '/company/settings') {
      if (pathname === '/company/settings') return true
      if (pathname?.startsWith('/company/settings/')) return true
    }
    if (href === '/performer/settings') {
      if (pathname === '/performer/settings') return true
      if (pathname?.startsWith('/performer/settings/')) return true
    }
    if (href === '/company/orders') {
      if (pathname === '/company/orders' || pathname === '/company/orders-past')
        return true
    }
    if (pathname !== path) return false
    if (hash) return currentHash === `#${hash}`
    return !currentHash
  }

  const openNewOrder = (href) => {
    const params = new URLSearchParams({ create: 'order' })
    if (activeMembership?.tenantId) params.set('companyId', String(activeMembership.tenantId))
    const target = `${href}?${params}`
    if (pathname !== href && !requestPartyLeave({ kind: 'route', target })) return
    setMobileMenuOpen(false)
    if (pathname === href) window.dispatchEvent(new Event('partycrm:create-order'))
    else router.push(target)
  }

  const logout = async () => {
    const target = '/party/login?callbackUrl=/party/entry'
    if (!requestPartyLeave({ kind: 'route', target })) return
    await fetch('/api/party/auth/logout', { method: 'POST' }).catch(() => null)
    allowPartyNavigation(target)
    router.replace(target)
  }

  return (
    <>
      <PartyUnsavedChangesBootstrap />
      <main
        style={{
          '--party-mobile-nav-height':
            profileLoaded && primaryMenu.length > 0 ? '4rem' : '0px',
        }}
        className="grid h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#eaf6ff] text-slate-950 md:grid-cols-[248px_1fr]"
      >
        <aside className="hidden min-h-0 flex-col bg-slate-950 text-white md:flex">
          <div className="flex h-16 items-center border-b border-white/10 px-5">
            <Link href="/party" className="text-lg font-semibold text-sky-200">
              PartyCRM
            </Link>
          </div>

          <nav aria-label="Основная навигация" className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-3 py-4">
            {createItem ? (
              <button type="button" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200" onClick={() => openNewOrder(createItem.href)}>
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                Новая заявка
              </button>
            ) : null}
            <div className="grid min-w-0 gap-3">
              {navigationGroups.map((group) => (
                <NavigationGroup key={group.id} group={group} active={group.items.some((item) => isActive(item.href))}>
              {group.items.map((item) => {
                const isOrdersGroup =
                  isCompanyVariant && item.href === '/company/orders'
                const isSettingsGroup =
                  isCompanyVariant && companySettingsActive && item.href === '/company/settings'
                const isPerformerSettingsGroup =
                  effectiveVariant === 'performer' &&
                  item.href === '/performer/settings'

                return (
                  <div key={item.href} className="grid gap-1">
                    {isOrdersGroup ? (
                      <MenuGroupButton
                        item={item}
                        active={ordersActive}
                        open={ordersOpen}
                        controls="party-orders-desktop"
                        onClick={() => setOrdersExpanded(!ordersOpen)}
                      />
                    ) : isSettingsGroup ? (
                      <MenuGroupButton
                        item={item}
                        active={companySettingsActive}
                        open={companySettingsOpen}
                        controls="party-company-settings-desktop"
                        onClick={() =>
                          setCompanySettingsExpanded(!companySettingsOpen)
                        }
                      />
                    ) : isPerformerSettingsGroup ? (
                      <MenuGroupButton
                        item={item}
                        active={performerSettingsActive}
                        open={performerSettingsOpen}
                        controls="party-performer-settings-desktop"
                        onClick={() =>
                          setPerformerSettingsExpanded(!performerSettingsOpen)
                        }
                      />
                    ) : (
                      <MenuLink item={item} active={isActive(item.href)} />
                    )}
                    {isOrdersGroup && ordersOpen ? (
                      <div id="party-orders-desktop" className="mt-1">
                        <div className="grid gap-1">
                          {ordersSubMenu.map((subItem) => (
                            <SubMenuLink
                              key={subItem.href}
                              item={subItem}
                              active={pathname === subItem.href}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {isSettingsGroup && companySettingsOpen ? (
                      <div id="party-company-settings-desktop" className="mt-1">
                        <div className="grid gap-1">
                          {visibleCompanySettingsMenu.map((subItem) => (
                            <SubMenuLink
                              key={subItem.href}
                              item={subItem}
                              active={pathname === subItem.href}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {isPerformerSettingsGroup && performerSettingsOpen ? (
                      <div id="party-performer-settings-desktop" className="mt-1">
                        <div className="grid gap-1">
                          {PERFORMER_SETTINGS_TABS.map((subItem) => (
                            <SubMenuLink
                              key={subItem.href}
                              item={subItem}
                              active={pathname === subItem.href}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
                </NavigationGroup>
              ))}
            </div>

            <div className="mt-auto grid gap-1 border-t border-white/10 pt-4">
              {visibleSecondaryMenu.map((item) => (
                <MenuLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                />
              ))}
              {canUseSiteSettings ? (
                <div className="grid gap-1">
                  <MenuGroupButton
                    item={{
                      href: '/party/site-settings/tariffs',
                      label: 'Настройка сайта',
                      icon: faGear,
                      access: COMPANY_SETTINGS_ACCESS.DEV,
                    }}
                    active={siteSettingsActive}
                    open={siteSettingsOpen}
                    controls="party-site-settings-desktop"
                    onClick={() => setSiteSettingsExpanded(!siteSettingsOpen)}
                  />
                  {siteSettingsOpen ? (
                    <div id="party-site-settings-desktop" className="grid gap-1">
                      {PARTY_SITE_SETTINGS_TABS.map((subItem) => (
                        <SubMenuLink
                          key={subItem.href}
                          item={{
                            ...subItem,
                            access: COMPANY_SETTINGS_ACCESS.DEV,
                          }}
                          active={pathname === subItem.href}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={logout}
                className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <FontAwesomeIcon
                  icon={faRightFromBracket}
                  className="h-4 w-4 min-w-4"
                />
                <span>Выйти</span>
              </button>
            </div>
          </nav>
        </aside>

        <section className="grid min-h-0 min-w-0 grid-rows-[auto_1fr]">
          <div>
            <header className="relative z-20 flex h-16 items-center justify-between gap-3 border-b border-sky-100 bg-white px-4 md:bg-slate-950 md:text-white">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((value) => !value)}
                  className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-md border border-sky-100 text-sky-700 md:hidden"
                  aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
                  aria-expanded={mobileMenuOpen}
                  aria-controls={mobileMenuOpen ? 'party-primary-mobile-menu' : undefined}
                >
                  <span className="grid gap-1">
                    <span className="block h-0.5 w-5 bg-current" />
                    <span className="block h-0.5 w-5 bg-current" />
                    <span className="block h-0.5 w-5 bg-current" />
                  </span>
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold">{title}</h1>
                </div>
              </div>
            </header>

            {mobileMenuOpen && (
              <div ref={mobileMenu} id="party-primary-mobile-menu" className="fixed inset-x-0 top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 overflow-x-hidden overflow-y-auto border-b border-sky-100 bg-slate-950 px-3 py-3 text-white md:hidden">
                <nav aria-label="Меню разделов" className="grid min-w-0 gap-3">
                  {navigationGroups.map((group) => (
                    <NavigationGroup key={group.id} group={group} active={group.items.some((item) => isActive(item.href))}>
                  {group.items.map((item) => {
                    const isOrdersGroup =
                      isCompanyVariant && item.href === '/company/orders'
                    const isSettingsGroup =
                      isCompanyVariant && companySettingsActive && item.href === '/company/settings'
                    const isPerformerSettingsGroup =
                      effectiveVariant === 'performer' &&
                      item.href === '/performer/settings'

                    return (
                      <div key={item.href} className="grid gap-1">
                        {isOrdersGroup ? (
                          <MenuGroupButton
                            item={item}
                            active={ordersActive}
                            open={ordersOpen}
                            controls="party-orders-mobile"
                            onClick={() => setOrdersExpanded(!ordersOpen)}
                          />
                        ) : isSettingsGroup ? (
                          <MenuGroupButton
                            item={item}
                            active={companySettingsActive}
                            open={companySettingsOpen}
                            controls="party-company-settings-mobile"
                            onClick={() =>
                              setCompanySettingsExpanded(!companySettingsOpen)
                            }
                          />
                        ) : isPerformerSettingsGroup ? (
                          <MenuGroupButton
                            item={item}
                            active={performerSettingsActive}
                            open={performerSettingsOpen}
                            controls="party-performer-settings-mobile"
                            onClick={() =>
                              setPerformerSettingsExpanded(
                                !performerSettingsOpen
                              )
                            }
                          />
                        ) : (
                          <MenuLink
                            item={item}
                            active={isActive(item.href)}
                            onClick={() => {
                              setCurrentHash(
                                item.href.includes('#')
                                  ? `#${item.href.split('#')[1]}`
                                  : ''
                              )
                              setMobileMenuOpen(false)
                            }}
                          />
                        )}
                        {isOrdersGroup && ordersOpen ? (
                          <div id="party-orders-mobile" className="mt-1">
                            <div className="grid gap-1">
                              {ordersSubMenu.map((subItem) => (
                                <SubMenuLink
                                  key={subItem.href}
                                  item={subItem}
                                  active={pathname === subItem.href}
                                  onClick={() => {
                                    setCurrentHash('')
                                    setMobileMenuOpen(false)
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {isSettingsGroup && companySettingsOpen ? (
                          <div id="party-company-settings-mobile" className="mt-1">
                            <div className="grid gap-1">
                              {visibleCompanySettingsMenu.map((subItem) => (
                                <SubMenuLink
                                  key={subItem.href}
                                  item={subItem}
                                  active={pathname === subItem.href}
                                  onClick={() => {
                                    setCurrentHash('')
                                    setMobileMenuOpen(false)
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {isPerformerSettingsGroup && performerSettingsOpen ? (
                          <div id="party-performer-settings-mobile" className="mt-1">
                            <div className="grid gap-1">
                              {PERFORMER_SETTINGS_TABS.map((subItem) => (
                                <SubMenuLink
                                  key={subItem.href}
                                  item={subItem}
                                  active={pathname === subItem.href}
                                  onClick={() => {
                                    setCurrentHash('')
                                    setMobileMenuOpen(false)
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                    </NavigationGroup>
                  ))}
                  {visibleSecondaryMenu.map((item) => (
                    <MenuLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      onClick={() => {
                        setCurrentHash(
                          item.href.includes('#')
                            ? `#${item.href.split('#')[1]}`
                            : ''
                        )
                        setMobileMenuOpen(false)
                      }}
                    />
                  ))}
                  {canUseSiteSettings ? (
                    <div className="grid gap-1">
                      <MenuGroupButton
                        item={{
                          href: '/party/site-settings/tariffs',
                          label: 'Настройка сайта',
                          icon: faGear,
                          access: COMPANY_SETTINGS_ACCESS.DEV,
                        }}
                        active={siteSettingsActive}
                        open={siteSettingsOpen}
                        controls="party-site-settings-mobile"
                        onClick={() =>
                          setSiteSettingsExpanded(!siteSettingsOpen)
                        }
                      />
                      {siteSettingsOpen ? (
                        <div id="party-site-settings-mobile" className="grid gap-1">
                          {PARTY_SITE_SETTINGS_TABS.map((subItem) => (
                            <SubMenuLink
                              key={subItem.href}
                              item={{
                                ...subItem,
                                access: COMPANY_SETTINGS_ACCESS.DEV,
                              }}
                              active={pathname === subItem.href}
                              onClick={() => {
                                setCurrentHash('')
                                setMobileMenuOpen(false)
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={logout}
                    className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/80"
                  >
                    <FontAwesomeIcon
                      icon={faRightFromBracket}
                      className="h-4 w-4 min-w-4"
                    />
                    <span>Выйти</span>
                  </button>
                </nav>
              </div>
            )}
          </div>

          <div data-party-workspace-scroll inert={mobileMenuOpen || undefined} className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pb-[calc(var(--party-mobile-nav-height,0px)+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
        </section>
        {profileLoaded && primaryMenu.length > 0 && (
          <PartyMobileNav
            pathname={pathname}
            items={mobileNavItems}
            menuOpen={mobileMenuOpen}
            onMenu={setMobileMenuOpen}
            onCreate={openNewOrder}
          />
        )}
      </main>
    </>
  )
}
