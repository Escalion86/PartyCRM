import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPartyHistoryTracker,
  PARTY_HISTORY_STATE_KEY,
} from './partyHistoryTracker.js'

const nextState = (name) => ({
  __NA: true,
  __PRIVATE_NEXTJS_INTERNALS_TREE: ['', { children: [name, {}] }],
  custom: { preserve: name },
})
const setup = () => {
  const window = { location: { href: 'https://partycrm.test/a' } }
  let position = 0,
    counter = 0
  const stack = [{ url: window.location.href, state: nextState('a') }]
  const history = {
    get state() {
      return stack[position].state
    },
    get length() {
      return stack.length
    },
    pushState(state, _unused, href) {
      stack.splice(position + 1)
      stack.push({
        state: structuredClone(state),
        url: new URL(href || window.location.href, window.location.href).href,
      })
      position += 1
      window.location.href = stack[position].url
    },
    replaceState(state, _unused, href) {
      stack[position] = {
        state: structuredClone(state),
        url: new URL(href || window.location.href, window.location.href).href,
      }
      window.location.href = stack[position].url
    },
    go(delta) {
      position += delta
      assert.ok(position >= 0 && position < stack.length)
      window.location.href = stack[position].url
    },
  }
  window.history = history
  const tracker = createPartyHistoryTracker(window, {
    token: () => `id-${++counter}`,
  })
  return { window, history, tracker, stack }
}

test('only the private marker is added; Next tree, user fields and caller object remain intact', () => {
  const state = setup()
  const body = nextState('b')
  state.history.pushState(body, '', '/b')
  assert.deepEqual(
    state.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE,
    body.__PRIVATE_NEXTJS_INTERNALS_TREE
  )
  assert.deepEqual(state.history.state.custom, { preserve: 'b' })
  assert.equal(state.history.state.__NA, true)
  assert.equal(Object.hasOwn(body, PARTY_HISTORY_STATE_KEY), false)
  assert.equal(state.tracker.read().index, 1)
})

test('duplicate URLs have distinct real entries and replacement keeps the current index', () => {
  const state = setup()
  state.history.pushState(nextState('a-copy'), '', '/a')
  const duplicate = state.tracker.read()
  assert.equal(duplicate.index, 1)
  state.history.replaceState(nextState('a-updated'), '', '/a?view=calendar')
  assert.equal(state.tracker.read().index, 1)
  assert.equal(state.tracker.read().entry, duplicate.entry)
  assert.equal(state.history.length, 2)
})

test('Back, Forward and multi-entry restoration keep stack length and exact Next state', () => {
  const state = setup()
  for (const name of ['b', 'c', 'd'])
    state.history.pushState(nextState(name), '', `/${name}`)
  const before = structuredClone(state.history.state)
  state.history.go(-3)
  const target = state.tracker.adoptPop()
  assert.equal(target.index, 0)
  state.history.go(3 - target.index)
  assert.equal(state.tracker.adoptPop().index, 3)
  assert.deepEqual(state.history.state, before)
  assert.equal(state.history.length, 4)
})

test('a copied native hash state gets a unique index without replacing Next fields', () => {
  const state = setup()
  const copied = structuredClone(state.history.state)
  state.stack.push({ url: 'https://partycrm.test/a#details', state: copied })
  state.history.go(1)
  assert.equal(state.tracker.adoptPop().index, 1)
  assert.equal(state.history.state.__NA, true)
  state.history.pushState(nextState('b'), '', '/b')
  assert.equal(state.tracker.read().index, 2)
  state.history.go(-2)
  assert.equal(state.tracker.adoptPop().index, 0)
  state.history.go(2)
  assert.equal(state.tracker.adoptPop().index, 2)
})

test('a new bootstrap reuses the persisted marker after reload instead of resetting indexes', () => {
  const state = setup()
  state.history.pushState(nextState('b'), '', '/b')
  const old = state.tracker.read()
  state.tracker.dispose()
  const next = createPartyHistoryTracker(state.window, {
    token: () => 'new-token',
  })
  assert.equal(next.read().session, old.session)
  assert.equal(next.read().index, 1)
  state.history.pushState(nextState('c'), '', '/c')
  assert.equal(next.read().index, 2)
})

test('a native null-state fragment is identified without inventing Next router fields', () => {
  const state = setup()
  state.stack.push({ url: 'https://partycrm.test/a#native', state: null })
  state.history.go(1)
  const current = state.tracker.adoptPop()
  assert.equal(current.index, 1)
  assert.equal(current.nativeFragment, true)
  assert.equal(Object.hasOwn(state.history.state, '__NA'), false)
  assert.equal(
    Object.hasOwn(state.history.state, '__PRIVATE_NEXTJS_INTERNALS_TREE'),
    false
  )
})
