import test from 'node:test'
import assert from 'node:assert/strict'
import { createPartyUnsavedChangesRuntime } from './partyUnsavedChangesRuntime.js'
import {
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  publishPartyActiveCompanyId,
} from '../../../helpers/partyActiveCompany.js'

const createBrowser = () => {
  const browser = new EventTarget()
  const values = new Map([[PARTY_ACTIVE_COMPANY_STORAGE_KEY, 'a']])
  browser.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  browser.document = new EventTarget()
  browser.location = { href: 'https://partycrm.test/company/settings/general' }
  browser.history = {
    state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['settings'] },
    pushState(state, unused, url) {
      this.state = state
      if (url) browser.location.href = new URL(url, browser.location.href).href
    },
    replaceState(state, unused, url) {
      this.state = state
      if (url) browser.location.href = new URL(url, browser.location.href).href
    },
  }
  browser.crypto = { randomUUID: () => 'qa-history' }
  return browser
}

test('rejecting another tab pins this tab without rewriting storage; selecting the stored company still confirms', () => {
  const browser = createBrowser()
  const originalWindow = globalThis.window
  globalThis.window = browser
  let decision = false
  let prompts = 0
  const runtime = createPartyUnsavedChangesRuntime(browser, {
    forceHistoryFallback: true,
    confirm: () => {
      prompts += 1
      return decision
    },
  })
  const companyChanges = []
  browser.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, (event) => {
    companyChanges.push(event.detail.companyId)
  })
  try {
    runtime.store.register('settings', { dirty: true, scope: 'a' })
    browser.localStorage.setItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY, 'b')
    const storage = new Event('storage')
    Object.assign(storage, {
      key: PARTY_ACTIVE_COMPANY_STORAGE_KEY,
      newValue: 'b',
    })
    browser.dispatchEvent(storage)
    assert.equal(prompts, 1)
    assert.deepEqual(companyChanges, ['a'])
    assert.equal(
      browser.localStorage.getItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY),
      'b'
    )

    assert.equal(publishPartyActiveCompanyId('b'), false)
    assert.equal(prompts, 2)
    assert.deepEqual(companyChanges, ['a'])
    assert.equal(runtime.store.hasChanges(), true)

    decision = true
    assert.equal(runtime.request({ kind: 'company', target: 'b' }), true)
    assert.equal(publishPartyActiveCompanyId('b'), true)
    assert.equal(
      prompts,
      3,
      'explicit chooser request and publisher share one confirmation'
    )
    assert.deepEqual(companyChanges, ['a', 'b'])
  } finally {
    runtime.dispose()
    globalThis.window = originalWindow
  }
})

test('a pinned tab may reselect its own company without a warning', () => {
  const browser = createBrowser()
  const originalWindow = globalThis.window
  globalThis.window = browser
  let prompts = 0
  const runtime = createPartyUnsavedChangesRuntime(browser, {
    forceHistoryFallback: true,
    confirm: () => {
      prompts += 1
      return false
    },
  })
  try {
    runtime.store.register('settings', { dirty: true })
    browser.localStorage.setItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY, 'b')
    assert.equal(publishPartyActiveCompanyId('a'), true)
    assert.equal(prompts, 0)
    assert.equal(
      browser.localStorage.getItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY),
      'a'
    )
    assert.equal(runtime.store.hasChanges(), true)
  } finally {
    runtime.dispose()
    globalThis.window = originalWindow
  }
})
