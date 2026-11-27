import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import React from 'react'
import * as rolePermissions from '../../helpers/partyRolePermissions.js'
import * as resourceCalendar from '../../helpers/partyResourceCalendar.js'
import * as today from '../../helpers/partyToday.js'
import * as ticketing from '../../helpers/partyTicketing.js'
import * as companyBranding from '../../helpers/partyCompanyBranding.js'
import * as companyModules from '../../helpers/partyCompanyModules.js'
import * as mobileNavigation from '../../helpers/partyMobileNavigation.js'
import * as navigationGroups from '../../helpers/partyNavigationGroups.js'
import * as operationalPermissions from '../../helpers/partyOperationalPermissions.js'
import * as companySettings from '../../app/company/settings/companySettingsTabs.js'
import { createHookHost, nodes } from './orders/partyOrderBoardTestHost.mjs'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const source = await readFile(
  new URL('./PartyAppShell.js', import.meta.url),
  'utf8'
)
const code = transformSync(source, {
  filename: 'PartyAppShell.js',
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'automatic' } },
  },
  module: { type: 'commonjs' },
}).code
const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  roleId = 'c'.repeat(24)
const membership = ({
  role = 'performer',
  permissions = {},
  active = true,
  modules,
} = {}) => ({
  tenantId,
  role,
  status: active ? 'active' : 'archived',
  isAdmin: ['owner', 'admin'].includes(role),
  company: { title: 'Тестовая компания', settings: { modules } },
  staff: {
    _id: staffId,
    tenantId,
    role,
    status: active ? 'active' : 'archived',
    positionId: roleId,
  },
  position: {
    _id: roleId,
    tenantId,
    active: true,
    permissions: {
      orders: 'read',
      'orders.eventDate': 'read',
      'orders.dateEnd': 'read',
      'orders.locationId': 'read',
      locations: 'read',
      ...permissions,
    },
  },
})
const setup = ({
  variant = 'performer',
  role = 'performer',
  permissions,
  active,
  pathname = `/${variant}/resources`,
} = {}) => {
  const redirects = [],
    listeners = new Map()
  let current = membership({ role, permissions, active })
  const window = {
    location: { hash: '', pathname },
    addEventListener: (name, handler) => {
      const list = listeners.get(name) || new Set()
      list.add(handler)
      listeners.set(name, list)
    },
    removeEventListener: (name, handler) =>
      listeners.get(name)?.delete(handler),
    dispatchEvent() {},
  }
  const router = { replace: (url) => redirects.push(url) }
  const host = createHookHost(
    (hooks) => {
      const dependencies = {
        react: { ...React, ...hooks },
        'next/navigation': {
          usePathname: () => pathname,
          useRouter: () => router,
        },
        'next/link': { __esModule: true, default: 'a' },
        classnames: { __esModule: true, default: () => '' },
        '@fortawesome/free-solid-svg-icons': new Proxy(
          {},
          { get: (_, key) => key }
        ),
        '@fortawesome/react-fontawesome': { FontAwesomeIcon: 'i' },
        '../../app/company/settings/companySettingsTabs': companySettings,
        '../../app/performer/settings/performerSettingsTabs': {
          PERFORMER_SETTINGS_TABS: [],
        },
        '../../app/party/site-settings/siteSettingsNav': {
          PARTY_SITE_SETTINGS_TABS: [],
          canAccessPartySiteSettings: () => false,
          isPartySiteSettingsPath: () => false,
        },
        './PartyMobileNav': { __esModule: true, default: 'mobile-nav' },
        './PartyCompanyLogo': { __esModule: true, default: 'company-logo' },
        './PartyCompanyTheme.module.css': { __esModule: true, default: { workspace: 'theme' } },
        './navigation/PartyUnsavedChangesBootstrap': {
          __esModule: true,
          default: 'bootstrap',
        },
        './navigation/partyUnsavedChangesRuntime': {
          requestPartyLeave: () => true,
          allowPartyNavigation() {},
        },
        '@helpers/partyOperationalPermissions': operationalPermissions,
        '@helpers/partyRolePermissions': rolePermissions,
        '@helpers/partyMobileNavigation': mobileNavigation,
        '@helpers/partyNavigationGroups': navigationGroups,
        '@helpers/partyImpersonationClient': { partyFetch: (...args) => fetch(...args) },
        '@helpers/partyTicketing': ticketing,
        '@helpers/partyCompanyBranding': companyBranding,
        '@helpers/partyCompanyModules': companyModules,
        '@helpers/partyToday': today,
        '@helpers/partyResourceCalendar': resourceCalendar,
        '@helpers/partyActiveCompany': {
          PARTY_ACTIVE_COMPANY_STORAGE_KEY: 'company',
          PARTY_ACTIVE_COMPANY_EVENT: 'company-changed',
          readPartyActiveCompanyId: () => tenantId,
        },
      }
      const compiledModule = { exports: {} }
      const fetch = async (url) => ({
        ok: true,
        json: async () => ({
          data: url.includes('memberships')
            ? { memberships: [current] }
            : {
                user: {
                  interfaceRoles: [
                    role === 'performer' ? 'performer' : 'company',
                  ],
                },
              },
        }),
      })
      new Function('require', 'module', 'exports', 'window', 'fetch', code)(
        (name) => dependencies[name] || require(name),
        compiledModule,
        compiledModule.exports,
        window,
        fetch
      )
      return compiledModule.exports.default
    },
    { variant }
  )
  host.render()
  return {
    host,
    redirects,
    links: () =>
      [...nodes(host.value)].filter(
        (node) => node.props?.item?.resourceCalendar
      ),
    moduleLinks: () => [...nodes(host.value)]
      .filter((node) => node.props?.item?.module || node.props?.item?.ticketing)
      .map((node) => node.props.item.href),
    refresh: (next) => {
      current = next
      for (const listener of listeners.get('partycrm:profile-updated') || [])
        listener()
    },
  }
}

for (const [variant, role] of [
  ['company', 'admin'],
  ['performer', 'performer'],
  ['company', 'location_owner'],
]) {
  test(`resource navigation uses the shared guard in ${variant}/${role} and avoids legacy redirects`, async () => {
    const h = setup({ variant, role })
    await h.host.flush()
    assert.equal(
      h
        .links()
        .some((node) => node.props.item.href === `/${variant}/resources`),
      true
    )
    assert.deepEqual(h.redirects, [])
    h.refresh(membership({ role, permissions: { 'orders.dateEnd': 'hidden' } }))
    await h.host.flush()
    assert.equal(h.links().length, 0)
    h.host.dispose()
  })
}

test('an archived employee cannot see the resource calendar menu', async () => {
  const h = setup({ active: false })
  await h.host.flush()
  assert.equal(h.links().length, 0)
  h.host.dispose()
})

test('company navigation reflects active inventory and ticketing modules after settings change', async () => {
  const h = setup({ variant: 'company', role: 'owner' })
  await h.host.flush()
  assert.ok(h.moduleLinks().includes('/company/inventory'))
  assert.ok(!h.moduleLinks().includes('/company/ticketing'))
  h.refresh(membership({ role: 'owner', modules: { inventory: { enabled: false }, ticketing: { enabled: true } } }))
  await h.host.flush()
  assert.ok(!h.moduleLinks().includes('/company/inventory'))
  assert.ok(h.moduleLinks().includes('/company/ticketing'))
  h.host.dispose()
})

for (const [role, pathname] of [
  ['owner', '/company/settings'],
  ['admin', '/company/settings/documents'],
]) {
  test(`company settings are direct links under management for ${role}`, async () => {
    const h = setup({ variant: 'company', role, pathname })
    await h.host.flush()
    const navigation = [...nodes(h.host.value)]
    const management = navigation.find((node) => node.props?.group?.id === 'management')
    assert.ok(management)
    assert.deepEqual(
      management.props.group.items.filter((item) => item.href.startsWith('/company/settings')).map((item) => item.href),
      companySettings.COMPANY_SETTINGS_TABS.map((item) => item.href)
    )
    assert.equal(management.props.active, true)
    assert.equal(navigation.some((node) => node.props?.item?.label === 'Настройки компании'), false)
    const settingsLinks = [...nodes(management.props.children)].filter(
      (node) => node.props?.item?.href.startsWith('/company/settings')
    )
    assert.deepEqual(
      settingsLinks.filter((node) => node.props.active).map((node) => node.props.item.href),
      [pathname]
    )
    h.host.dispose()
  })
}

for (const [role, active] of [['performer', true], ['location_owner', true], ['admin', false]]) {
  test(`company settings links are hidden for ${role} with active membership ${active}`, async () => {
    const h = setup({ variant: 'company', role, active })
    await h.host.flush()
    assert.equal(
      [...nodes(h.host.value)].some((node) => node.props?.item?.href.startsWith('/company/settings')),
      false
    )
    h.host.dispose()
  })
}
