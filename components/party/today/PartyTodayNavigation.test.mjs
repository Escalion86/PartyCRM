import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import React from 'react'
import { resolvePartyInboxCompanyLink } from '../../../helpers/partyInboxCompanyLink.js'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const companyA = 'a'.repeat(24),
  companyB = 'b'.repeat(24),
  companyC = 'c'.repeat(24)
const companies = [
  { id: companyA, title: 'Компания А' },
  { id: companyB, title: 'Компания Б' },
]
const storedKey = 'partycrm.activeCompanyId'
const companyEvent = 'partycrm:company-changed'
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const compile = (source, dependencies = {}, environment = {}) => {
  const code = transformSync(source, {
    filename: 'Navigation.js',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  }).code
  const compiledModule = { exports: {} }
  new Function(
    'require',
    'module',
    'exports',
    ...Object.keys(environment),
    code
  )(
    (name) => dependencies[name] || require(name),
    compiledModule,
    compiledModule.exports,
    ...Object.values(environment)
  )
  return compiledModule.exports
}
const walk = (node, predicate) =>
  !node || typeof node !== 'object'
    ? []
    : [
        ...(predicate(node) ? [node] : []),
        ...React.Children.toArray(node.props?.children).flatMap((child) =>
          walk(child, predicate)
        ),
      ]

// This host runs the actual JSX and effect cleanup. Its window provides only
// URL/storage/event transport; company-selection policy belongs to the source.
const host = ({
  inbox = false,
  search = '',
  blocked = false,
  initialCompanies = companies,
  stored = companyA,
} = {}) => {
  const listeners = new Map(),
    hooks = [],
    publications = []
  let location = new URL(
    `https://partycrm.example/${inbox ? 'company/inbox' : 'performer/today'}${search}`
  )
  let storedCompany = stored,
    headerCompany = stored,
    cursor = 0,
    changed = true,
    effects = [],
    tree
  let props = { companies: initialCompanies }
  const window = {
    get location() {
      return location
    },
    localStorage: {
      getItem() {
        if (blocked) throw new Error('Storage disabled')
        return storedCompany
      },
      setItem(_key, value) {
        if (blocked) throw new Error('Storage disabled')
        storedCompany = value
      },
    },
    history: {
      state: { next: 'preserved' },
      replaceState(state, _title, url) {
        this.state = state
        location = new URL(url, location)
      },
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event) {
      if (event.type === companyEvent) headerCompany = event.detail.companyId
      for (const listener of [...(listeners.get(event.type) || [])])
        listener(event)
      return !event.defaultPrevented
    },
  }
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type
      this.detail = options.detail
      this.defaultPrevented = false
    }
    preventDefault() {
      this.defaultPrevented = true
    }
  }
  const active = compile(
    read('../../../helpers/partyActiveCompany.js'),
    {},
    { window, CustomEvent }
  )
  const publish = (id, options) => {
    publications.push({ id, options })
    return active.publishPartyActiveCompanyId(id, options)
  }
  const differs = (a, b) =>
    !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
  const mockReact = {
    ...React,
    useState(initial) {
      const index = cursor++
      hooks[index] ||= {
        value: typeof initial === 'function' ? initial() : initial,
      }
      return [
        hooks[index].value,
        (next) => {
          const value =
            typeof next === 'function' ? next(hooks[index].value) : next
          if (!Object.is(value, hooks[index].value)) {
            hooks[index].value = value
            changed = true
          }
        },
      ]
    },
    useRef(initial) {
      const index = cursor++
      return (hooks[index] ||= { current: initial })
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!hooks[index] || differs(hooks[index].deps, deps))
        hooks[index] = { deps, callback }
      return hooks[index].callback
    },
    useEffect(run, deps) {
      const index = cursor++
      if (!hooks[index] || differs(hooks[index].deps, deps)) {
        const previous = hooks[index]
        hooks[index] = { deps }
        effects.push(() => {
          previous?.cleanup?.()
          hooks[index].cleanup = run()
        })
      }
    },
    useSyncExternalStore(subscribe, snapshot) {
      const index = cursor++
      if (!hooks[index]) {
        hooks[index] = { value: snapshot() }
        hooks[index].cleanup = subscribe(() => {
          const value = snapshot()
          if (!Object.is(value, hooks[index].value)) {
            hooks[index].value = value
            changed = true
          }
        })
      }
      return snapshot()
    },
  }
  const Today = () => null
  const component = compile(
    read(inbox ? '../inbox/PartyInboxClient.js' : './PartyTodayWorkspace.js'),
    {
      react: mockReact,
      'next/navigation': { usePathname: () => location.pathname },
      'next/link': () => null,
      '@helpers/partyActiveCompany': {
        ...active,
        publishPartyActiveCompanyId: publish,
      },
      '@helpers/partyInboxCompanyLink': { resolvePartyInboxCompanyLink },
      '@helpers/partyInboxCore': {
        PARTY_INBOX_STATUSES: {},
        PARTY_INBOX_SALES_STAGES: {},
      },
      '@components/party/navigation/usePartyUnsavedChanges': {
        requestPartyLeave: () => true,
      },
      '@components/party/navigation/PartyUnsavedChangesBootstrap': () => null,
      './PartyToday': Today,
    },
    {
      window,
      requestAnimationFrame: (callback) => {
        callback()
        return 1
      },
      cancelAnimationFrame() {},
    }
  ).default
  const flush = () => {
    let renders = 0
    while (changed) {
      if (++renders > 30) throw new Error('Company navigation failed to settle')
      changed = false
      cursor = 0
      effects = []
      tree = component(props)
      effects.forEach((effect) => effect())
    }
    return tree
  }
  return {
    publications,
    get headerCompany() {
      return headerCompany
    },
    get url() {
      return location.href
    },
    find(predicate) {
      return walk(flush(), predicate)
    },
    view() {
      return walk(
        flush(),
        (node) => node.type === Today || node.type?.name === 'InboxWorkspace'
      )[0]
    },
    async settle() {
      for (let i = 0; i < 6; i++) {
        flush()
        await Promise.resolve()
      }
      return flush()
    },
    dispatch(event) {
      window.dispatchEvent(event)
      flush()
    },
    refreshCompanies(next) {
      props = { companies: next }
      changed = true
      flush()
    },
  }
}

for (const inbox of [false, true]) {
  const label = inbox ? 'Inbox' : 'Today'
  test(`${label}: explicit authorized company B wins over company A in storage`, async () => {
    const h = host({ inbox, search: `?companyId=${companyB}` })
    await h.settle()
    assert.equal(h.view().props.companyId, companyB)
    assert.equal(h.headerCompany, companyB)
    assert.equal(new URL(h.url).searchParams.has('companyId'), false)
  })
  test(`${label}: a foreign company query never loads the remembered first company`, async () => {
    const h = host({ inbox, search: `?companyId=${companyC}` })
    await h.settle()
    assert.equal(h.view(), undefined)
    assert.equal(h.find((node) => node.props?.role === 'alert').length, 1)
    assert.deepEqual(h.publications, [])
  })
  test(`${label}: revoking selected company B unmounts its data without a fallback to A`, async () => {
    const h = host({ inbox, search: `?companyId=${companyB}` })
    await h.settle()
    assert.equal(h.view().props.companyId, companyB)
    h.refreshCompanies([{ ...companies[0] }])
    await h.settle()
    assert.equal(h.view(), undefined)
    assert.equal(h.find((node) => node.props?.role === 'alert').length, 1)
  })
  test(`${label}: a storage event carries its new value even when storage cannot be read`, async () => {
    const h = host({ inbox, blocked: true })
    await h.settle()
    assert.equal(h.view().props.companyId, companyA)
    h.dispatch({ type: 'storage', key: storedKey, newValue: companyB })
    await h.settle()
    assert.equal(h.view().props.companyId, companyB)
  })
}

for (const inbox of [false, true])
  test(`${inbox ? 'Inbox' : 'Today'} rejects an unavailable external company and restores the header without overwriting another tab`, async () => {
    const h = host({ inbox })
    await h.settle()
    h.dispatch({ type: companyEvent, detail: { companyId: companyC } })
    await h.settle()
    assert.equal(h.view().props.companyId, companyA)
    assert.equal(h.headerCompany, companyA)
    assert.deepEqual(h.publications.at(-1), {
      id: companyA,
      options: { skipGuard: true, persist: false },
    })
    assert.equal(h.find((node) => node.props?.role === 'alert').length, 1)
  })

test('Inbox on a direct URL publishes its allowed fallback when a remembered company has no inbox access', async () => {
  const h = host({ inbox: true, stored: companyC })
  await h.settle()
  assert.equal(h.view().props.companyId, companyA)
  assert.equal(h.headerCompany, companyA)
})

test('Inbox retains explicit company B through new router props with disabled storage and removed query', async () => {
  const h = host({
    inbox: true,
    blocked: true,
    search: `?companyId=${companyB}`,
  })
  await h.settle()
  assert.equal(new URL(h.url).searchParams.has('companyId'), false)
  h.refreshCompanies(companies.map((company) => ({ ...company })))
  await h.settle()
  assert.equal(h.view().props.companyId, companyB)
  assert.equal(h.headerCompany, companyB)
})

test('the actual mobile create handler carries its company to another route and respects a rejected navigation', () => {
  const shell = read('../PartyAppShell.js')
  const marker = 'onCreate={(href) => {'
  const start = shell.indexOf(marker)
  assert.notEqual(start, -1)
  const end = shell.indexOf('\n            }}', start)
  assert.notEqual(end, -1)
  const body = shell.slice(start + marker.length, end)
  for (const allowed of [true, false]) {
    const pushes = [],
      intents = [],
      events = [],
      menu = []
    const onCreate = new Function(
      'pathname',
      'activeMembership',
      'requestPartyLeave',
      'router',
      'window',
      'setMobileMenuOpen',
      `return (href) => {${body}\n}`
    )(
      '/performer/today',
      { tenantId: companyB },
      (intent) => {
        intents.push(intent)
        return allowed
      },
      { push: (url) => pushes.push(url) },
      { dispatchEvent: (event) => events.push(event) },
      (value) => menu.push(value)
    )
    onCreate('/performer/work')
    const target = `/performer/work?create=order&companyId=${companyB}`
    assert.equal(intents[0].target, target)
    assert.deepEqual(pushes, allowed ? [target] : [])
    assert.deepEqual(menu, allowed ? [false] : [])
    assert.deepEqual(events, [])
  }
})
