import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getNextCalendarDraftState,
  getNextSyncCursor,
  isGoogleCalendarLocked,
} from './PartyGoogleCalendarSettingsState.js'

test('keeps dirty draft during background status refresh', () => {
  const draft = { syncSettings: { titleMode: 'services' } }
  assert.deepEqual(
    getNextCalendarDraftState({
      currentDraft: draft,
      dirty: true,
      syncDraft: false,
      statusSettings: { syncSettings: { titleMode: 'eventType' } },
    }),
    { draft, dirty: true }
  )
})

test('resets draft for initial, oauth and explicit reset reloads', () => {
  const statusSettings = { syncSettings: { titleMode: 'eventType' } }
  assert.deepEqual(
    getNextCalendarDraftState({
      currentDraft: { syncSettings: { titleMode: 'services' } },
      dirty: true,
      syncDraft: true,
      statusSettings,
    }),
    { draft: statusSettings, dirty: false }
  )
})

test('requires batch cursor to advance and limits iterations', () => {
  assert.equal(
    getNextSyncCursor({ currentCursor: '', nextCursor: 'order-20', iteration: 1 }),
    'order-20'
  )
  assert.throws(
    () =>
      getNextSyncCursor({
        currentCursor: 'order-20',
        nextCursor: 'order-20',
        iteration: 2,
      }),
    /не продвинулась/i
  )
  assert.throws(
    () =>
      getNextSyncCursor({
        currentCursor: 'order-20',
        nextCursor: 'order-40',
        iteration: 101,
      }),
    /лимит/i
  )
})

test('locks conservatively while access is unknown or denied by either source', () => {
  assert.equal(isGoogleCalendarLocked({ access: null, status: null }), true)
  assert.equal(
    isGoogleCalendarLocked({
      access: { allowCalendarSync: true },
      status: { allowCalendarSync: true },
    }),
    false
  )
  assert.equal(
    isGoogleCalendarLocked({
      access: { allowCalendarSync: true },
      status: { allowCalendarSync: false },
    }),
    true
  )
  assert.equal(
    isGoogleCalendarLocked({
      access: { allowCalendarSync: false },
      status: { allowCalendarSync: true },
    }),
    true
  )
})
