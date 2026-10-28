import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartyTasksQuery,
  canMovePartyTask,
  mergePartyTaskBoardPages,
  partyTaskViewPreferenceKey,
  readPartyTaskView,
  savePartyTaskView,
} from './partyTaskViews.js'

test('board status moves honor complete/reopen flags without inferring grants from edit', () => {
  assert.equal(
    canMovePartyTask({ status: 'new', canComplete: true }, 'in_progress'),
    true
  )
  assert.equal(
    canMovePartyTask({ status: 'in_progress', canComplete: true }, 'new'),
    true
  )
  assert.equal(
    canMovePartyTask({ status: 'new', canComplete: true }, 'done'),
    true
  )
  assert.equal(
    canMovePartyTask({ status: 'new', canEdit: true }, 'done'),
    false
  )
  assert.equal(
    canMovePartyTask({ status: 'done', canEdit: true }, 'new'),
    false
  )
  assert.equal(
    canMovePartyTask({ status: 'done', canReopen: true }, 'new'),
    true
  )
  assert.equal(
    canMovePartyTask({ status: 'canceled', canReopen: true }, 'in_progress'),
    true
  )
  assert.equal(
    canMovePartyTask({ status: 'canceled', canReopen: true }, 'done'),
    false
  )
  assert.equal(
    canMovePartyTask({ status: 'done', canComplete: true }, 'new'),
    false
  )
  assert.equal(
    canMovePartyTask({ status: 'new', canComplete: true }, 'new'),
    false
  )
  assert.equal(
    canMovePartyTask({ status: 'new', canCancel: true }, 'canceled'),
    false
  )
  assert.equal(canMovePartyTask(undefined, 'done'), false)
})

test('view preference is isolated by employee and company with mobile fallback', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  savePartyTaskView(storage, 'company1', 'staff1', 'list')
  assert.equal(readPartyTaskView(storage, 'company1', 'staff1'), 'list')
  assert.equal(readPartyTaskView(storage, 'company1', 'staff2'), 'board')
  assert.equal(readPartyTaskView(storage, 'company2', 'staff1', true), 'list')
  savePartyTaskView(storage, 'company1', 'staff1', 'invalid')
  assert.equal(readPartyTaskView(storage, 'company1', 'staff1'), 'list')
  assert.notEqual(
    partyTaskViewPreferenceKey('a:b', 'c'),
    partyTaskViewPreferenceKey('a', 'b:c')
  )
  assert.equal(partyTaskViewPreferenceKey('company1', ''), null)
})

test('storage failures never prevent selecting a view', () => {
  const storage = {
    getItem() {
      throw new Error('denied')
    },
    setItem() {
      throw new Error('quota')
    },
  }
  assert.equal(readPartyTaskView(storage, 'c', 's'), 'board')
  assert.equal(readPartyTaskView(storage, 'c', 's', true), 'list')
  assert.doesNotThrow(() => savePartyTaskView(storage, 'c', 's', 'board'))
})

test('search, assignment and independent column cursors are sent to server', () => {
  const query = buildPartyTasksQuery({
    filter: 'all',
    scope: 'role',
    search: '  Заказ & сцена  ',
    status: 'done',
    cursor: '600000000000000000000001',
    orderId: '700000000000000000000001',
  })
  assert.equal(query.get('search'), 'Заказ & сцена')
  assert.equal(query.get('scope'), 'role')
  assert.equal(query.get('status'), 'done')
  assert.equal(query.get('filter'), 'all')
  assert.equal(query.get('cursor'), '600000000000000000000001')
  assert.equal(query.get('orderId'), '700000000000000000000001')
})

test('today/overdue paging carries one explicit time snapshot and local day bounds', () => {
  const now = new Date(2026, 9, 28, 23, 50)
  const today = buildPartyTasksQuery({ filter: 'today', now })
  const from = new Date(today.get('dayFrom'))
  const to = new Date(today.get('dayTo'))
  assert.equal(from.getDate(), 28)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 29)
  assert.equal(to.getHours(), 0)
  assert.equal(
    buildPartyTasksQuery({ filter: 'overdue', now }).get('now'),
    now.toISOString()
  )
})

const page = (status, tasks, nextCursor = null, staff = []) => ({
  status,
  data: { tasks, nextCursor, staff, roles: [], currentStaffId: 'staff1' },
})

test('independent board pagination retains all columns and shared assignment once', () => {
  const base = { tasks: [], staff: [], roles: [] }
  const first = mergePartyTaskBoardPages(base, [
    page('new', [{ _id: 'a', status: 'new', revision: 1 }], 'new-cursor', [
      { _id: 's1', name: 'Один' },
    ]),
    page(
      'in_progress',
      [{ _id: 'b', status: 'in_progress', revision: 1 }],
      'work-cursor',
      [{ _id: 's2', name: 'Два' }]
    ),
    page('done', [{ _id: 'c', status: 'done', revision: 1 }]),
  ])
  const next = mergePartyTaskBoardPages(
    first,
    [page('new', [{ _id: 'd', status: 'new', revision: 1 }])],
    true
  )
  assert.deepEqual(
    next.columns.new.tasks.map((row) => row._id),
    ['a', 'd']
  )
  assert.equal(next.columns.new.nextCursor, null)
  assert.equal(next.columns.in_progress.nextCursor, 'work-cursor')
  assert.deepEqual(
    next.tasks.map((row) => row._id),
    ['a', 'd', 'b', 'c']
  )
  assert.deepEqual(
    next.staff.map((row) => row._id),
    ['s1', 's2']
  )
  assert.equal(first.columns.new.tasks.length, 1)
})

test('empty ACL search chunks keep a working next cursor instead of a false empty result', () => {
  const result = mergePartyTaskBoardPages({ staff: [], roles: [] }, [
    page('new', [], 'continue'),
  ])
  assert.deepEqual(result.columns.new.tasks, [])
  assert.equal(result.columns.new.nextCursor, 'continue')
})

test('task moved between concurrent column replies appears once at newest revision', () => {
  const result = mergePartyTaskBoardPages({ staff: [], roles: [] }, [
    page('new', [{ _id: 'shared', status: 'new', revision: 1 }]),
    page('done', [{ _id: 'shared', status: 'done', revision: 2 }]),
  ])
  assert.equal(result.tasks.length, 1)
  assert.equal(result.columns.new.tasks.length, 0)
  assert.equal(result.columns.done.tasks[0].revision, 2)
  const stale = mergePartyTaskBoardPages(
    result,
    [page('new', [{ _id: 'shared', status: 'new', revision: 1 }])],
    true
  )
  assert.equal(stale.tasks.length, 1)
  assert.equal(stale.tasks[0].status, 'done')
})

test('full board refresh removes outdated pages and assignee metadata', () => {
  const old = mergePartyTaskBoardPages({ staff: [], roles: [] }, [
    page('new', [{ _id: 'old', status: 'new' }], 'old-cursor', [
      { _id: 'old', name: 'Старый' },
    ]),
  ])
  const fresh = mergePartyTaskBoardPages(old, [page('new', [])])
  assert.deepEqual(fresh.tasks, [])
  assert.deepEqual(fresh.staff, [])
  assert.equal(fresh.columns.new.nextCursor, null)
})
