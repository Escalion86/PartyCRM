import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import React from 'react'
import * as rolePermissions from '../../helpers/partyRolePermissions.js'
import * as resourceCalendar from '../../helpers/partyResourceCalendar.js'
import * as today from '../../helpers/partyToday.js'
import * as ticketing from '../../helpers/partyTicketing.js'
import * as mobileNavigation from '../../helpers/partyMobileNavigation.js'
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
} = {}) => ({
  tenantId,
  role,
  status: active ? 'active' : 'archived',
  isAdmin: ['owner', 'admin'].includes(role),
  company: { title: 'Тестовая компания' },
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
} = {}) => {
  const redirects = [],
    listeners = new Map()
  let current = membership({ role, permissions, active })
  const pathname = `${variant}/resources`.replace(/^/, '/')
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
        '@helpers/partyTicketing': ticketing,
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
