import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import {
  createHookHost,
  nodes,
  textOf,
} from '../orders/partyOrderBoardTestHost.mjs'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')
const compile = (source, dependencies, environment) => {
  const code = transformSync(source, {
    filename: 'ResourcesWorkspace.js',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  }).code
  const compiled = { exports: {} }
  new Function(
    'require',
    'module',
    'exports',
    ...Object.keys(environment),
    code
  )(
    (name) => dependencies[name] || require(name),
    compiled,
    compiled.exports,
    ...Object.values(environment)
  )
  return compiled.exports
}
const companyA = 'a'.repeat(24),
  companyB = 'b'.repeat(24),
  companyC = 'c'.repeat(24)
const companies = [
  { id: companyA, title: 'А' },
  { id: companyB, title: 'Б' },
]
const Content = () => null
const fixture = ({
  search = '',
  blocked = false,
  stored = companyA,
  canLeave = true,
} = {}) => {
  const events = new Map(),
    writes = []
  let storage = stored,
    header = stored
  let location = new URL(
    `https://partycrm.example/performer/resources${search}`
  )
  class CustomEvent {
    constructor(type, options) {
      this.type = type
      this.detail = options.detail
    }
  }
  const window = {
    get location() {
      return location
    },
    localStorage: {
      getItem() {
        if (blocked) throw new Error('blocked')
        return storage
      },
      setItem(key, value) {
        if (blocked) throw new Error('blocked')
        storage = value
        writes.push({ key, value })
      },
    },
    history: {
      state: { next: true },
      replaceState(state, _unused, url) {
        this.state = state
        location = new URL(url, location)
      },
    },
    addEventListener(name, fn) {
      if (!events.has(name)) events.set(name, new Set())
      events.get(name).add(fn)
    },
    removeEventListener(name, fn) {
      events.get(name)?.delete(fn)
    },
    dispatchEvent(event) {
      if (event.type === 'partycrm:company-changed')
        header = event.detail.companyId
      for (const fn of [...(events.get(event.type) || [])]) fn(event)
      return true
    },
  }
  const active = compile(
    read('../../../helpers/partyActiveCompany.js'),
    {},
    { window, CustomEvent }
  )
  const h = createHookHost(
    (hooks) => {
      const component = compile(
        read('./PartyResourceCalendarWorkspace.js'),
        {
          react: { ...React, ...hooks },
          'next/navigation': { usePathname: () => location.pathname },
          '@helpers/partyActiveCompany': active,
          '@components/party/navigation/usePartyUnsavedChanges': {
            requestPartyLeave: () => canLeave,
          },
          '@components/party/navigation/PartyUnsavedChangesBootstrap': () =>
            null,
          './PartyResourceCalendar': Content,
        },
        {
          window,
          requestAnimationFrame: (run) => {
            run()
            return 1
          },
          cancelAnimationFrame() {},
        }
      ).default
      return (props) => component(props)
    },
    { companies }
  )
  h.render()
  return {
    h,
    writes,
    get companyId() {
      return (
        [...nodes(h.value)].find((node) => node.type === Content)?.props.company
          .id || ''
      )
    },
    get error() {
      return [...nodes(h.value)]
        .filter((node) => node.props?.role === 'alert')
        .map(textOf)
        .join('')
    },
    get header() {
      return header
    },
    get url() {
      return location.href
    },
    get history() {
      return window.history.state
    },
    select(id) {
      ;[...nodes(h.value)]
        .find((node) => node.type === 'select')
        .props.onChange({ target: { value: id } })
      h.render()
    },
    event(id) {
      window.dispatchEvent(
        new CustomEvent(active.PARTY_ACTIVE_COMPANY_EVENT, {
          detail: { companyId: id },
        })
      )
      h.render()
    },
    storage(id) {
      window.dispatchEvent({
        type: 'storage',
        key: active.PARTY_ACTIVE_COMPANY_STORAGE_KEY,
        newValue: id,
      })
      h.render()
    },
  }
}

test('resource company link overrides storage, consumes its query and preserves Next history', () => {
  const f = fixture({ search: `?companyId=${companyB}&keep=1` })
  assert.equal(f.companyId, companyB)
  assert.equal(f.header, companyB)
  assert.doesNotMatch(f.url, /companyId=/)
  assert.match(f.url, /keep=1/)
  assert.deepEqual(f.history, { next: true })
  f.h.dispose()
})

test('foreign or duplicate explicit company parameters never load a stored fallback', () => {
  for (const search of [
    `?companyId=${companyC}`,
    `?companyId=${companyA}&companyId=${companyB}`,
  ]) {
    const f = fixture({ search })
    assert.equal(f.companyId, '')
    assert.match(f.error, /Компания из ссылки недоступна/)
    f.select(companyB)
    assert.equal(f.companyId, companyB)
    assert.equal(f.error, '')
    assert.doesNotMatch(f.url, /companyId=/)
    f.h.dispose()
  }
})

test('resource navigation keeps explicit selection through new props with storage disabled and honors revocation', () => {
  const f = fixture({ search: `?companyId=${companyB}`, blocked: true })
  assert.equal(f.companyId, companyB)
  f.h.setProps({ companies: companies.map((company) => ({ ...company })) })
  assert.equal(f.companyId, companyB)
  f.h.setProps({ companies: [companies[0]] })
  assert.equal(f.companyId, '')
  assert.match(f.error, /Доступ к компании изменился/)
  f.select(companyA)
  assert.equal(f.companyId, companyA)
  f.h.dispose()
})

test('external unavailable company restores this header without overwriting another tab and storage uses newValue', async () => {
  const f = fixture()
  const writes = f.writes.length
  f.event(companyC)
  await f.h.flush()
  assert.equal(f.companyId, companyA)
  assert.equal(f.header, companyA)
  assert.equal(f.writes.length, writes)
  assert.match(f.error, /календарь ресурсов недоступен/)
  f.storage(companyB)
  assert.equal(f.companyId, companyB)
  assert.equal(f.error, '')
  f.h.dispose()
})

test('resource company switching respects the existing leave guard', () => {
  const f = fixture({ canLeave: false })
  f.select(companyB)
  assert.equal(f.companyId, companyA)
  assert.equal(f.header, companyA)
  f.h.dispose()
})
