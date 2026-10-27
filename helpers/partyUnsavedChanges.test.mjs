import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPartyUnsavedChangesStore,
  partyLinkLeavesPage,
} from './partyUnsavedChanges.js'

test('a reverted edit or a successful save removes the navigation warning', () => {
  let prompts = 0
  const store = createPartyUnsavedChangesStore({
    confirm: () => {
      prompts += 1
      return false
    },
  })
  store.register('general', { dirty: true })
  assert.equal(store.request({ target: '/reports' }), false)
  store.register('general', { dirty: false })
  assert.equal(store.request({ target: '/reports' }), true)
  assert.equal(prompts, 1)
})

test('all dirty forms produce one confirmation, cancellation retains every form', () => {
  const messages = []
  const store = createPartyUnsavedChangesStore({
    confirm: (message) => {
      messages.push(message)
      return false
    },
  })
  store.register('roles', { dirty: true, label: 'Должности' })
  store.register('google', { dirty: true, label: 'Google Calendar' })
  assert.equal(store.request({ kind: 'company', target: 'other' }), false)
  assert.equal(messages.length, 1)
  assert.match(messages[0], /Должности/)
  assert.match(messages[0], /Google Calendar/)
  assert.equal(store.hasChanges(), true)
})

test('accepted link and its router event share a short permission for that target only', () => {
  let time = 1,
    prompts = 0
  const store = createPartyUnsavedChangesStore({
    now: () => time,
    confirm: () => {
      prompts += 1
      return true
    },
  })
  store.register('form', { dirty: true })
  assert.equal(store.request({ kind: 'route', target: '/b' }), true)
  assert.equal(store.request({ kind: 'route', target: '/b' }), true)
  assert.equal(prompts, 1)
  assert.equal(store.request({ kind: 'route', target: '/c' }), true)
  assert.equal(prompts, 2)
  time += 5001
  assert.equal(store.request({ kind: 'route', target: '/c' }), true)
  assert.equal(prompts, 3)
})

test('pending save protects a clean form and unmount removes only that form', () => {
  let message
  const store = createPartyUnsavedChangesStore({
    confirm: (text) => {
      message = text
      return false
    },
  })
  const unregister = store.register('pending', {
    dirty: false,
    pending: true,
    scope: 'company-a',
  })
  assert.equal(store.hasChanges('company-a'), true)
  assert.equal(store.hasChanges('company-b'), false)
  assert.equal(store.request({ target: '/b' }), false)
  assert.match(message, /Сохранение ещё выполняется/)
  unregister()
  assert.equal(store.request({ target: '/b' }), true)
})

test('permission for the previous screen does not suppress a warning for a newly edited form', () => {
  let prompts = 0
  const store = createPartyUnsavedChangesStore({
    confirm: () => {
      prompts += 1
      return true
    },
  })
  store.register('old', { dirty: true })
  store.request({ kind: 'route', target: '/b' })
  store.unregister('old')
  store.register('new', { dirty: false })
  store.register('new', { dirty: true })
  assert.equal(store.hasRoutePermission(), false)
  store.request({ kind: 'route', target: '/b' })
  assert.equal(prompts, 2)
})

test('anchors, downloads and a new tab leave the current form mounted', () => {
  const location = {
    href: 'https://partycrm.test/company/settings/general?q=1',
  }
  const anchor = (href, extra = {}) => ({
    href,
    hasAttribute: () => false,
    ...extra,
  })
  assert.equal(partyLinkLeavesPage(anchor('#section'), location), false)
  assert.equal(
    partyLinkLeavesPage(anchor('/company/settings/roles'), location),
    true
  )
  assert.equal(
    partyLinkLeavesPage(
      anchor('/company/settings/roles', { target: '_blank' }),
      location
    ),
    false
  )
  assert.equal(
    partyLinkLeavesPage(
      anchor('/report.csv', { hasAttribute: () => true }),
      location
    ),
    false
  )
  assert.equal(partyLinkLeavesPage(anchor('tel:+79130000000'), location), false)
})
