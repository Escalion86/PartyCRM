import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPartyOrderBoardStages,
  getPartyOrderBoardTransitions,
  projectPartyOrderBoardColumns,
  resolvePartyOrderDeepLink,
} from './partyOrderBoard.js'
import {
  readPartyOrderViewPreference,
  writePartyOrderViewPreference,
} from './partyOrderViewPreference.js'

const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  roleId = 'c'.repeat(24)
const context = (grants = {}, scope = {}) => ({
  tenantId,
  role: 'performer',
  staff: {
    _id: staffId,
    tenantId,
    role: 'performer',
    status: 'active',
    positionId: roleId,
  },
  position: {
    _id: roleId,
    tenantId,
    active: true,
    permissions: {
      orders: 'read',
      'orders.workflowStageId': 'read',
      'orders.transition': 'edit',
      ...grants,
    },
    orderScope: scope,
  },
})
const workflow = {
  initialStageId: 'new',
  stages: [
    { id: 'new', title: 'Новая' },
    { id: 'prepare', title: 'Подготовка' },
    { id: 'review', title: 'Проверка' },
  ],
  transitions: [
    { fromStageId: 'new', toStageId: 'prepare', roleIds: [] },
    { fromStageId: 'new', toStageId: 'review', roleIds: ['d'.repeat(24)] },
    { fromStageId: 'prepare', toStageId: 'review', roleIds: [roleId] },
  ],
}
const order = (changes = {}) => ({
  _id: 'e'.repeat(24),
  workflowStageId: 'new',
  updatedAt: '2026-10-29T10:00:00Z',
  status: 'active',
  ...changes,
})

test('visible board columns intersect configured stages, role scope and stage filter', () => {
  assert.deepEqual(
    getPartyOrderBoardStages(
      context({}, { stageIds: ['new', 'prepare'] }),
      workflow
    ).map((stage) => stage.id),
    ['new', 'prepare']
  )
  assert.deepEqual(
    getPartyOrderBoardStages(
      context({}, { stageIds: ['new'] }),
      workflow,
      'prepare'
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardStages(
      context({ 'orders.workflowStageId': 'hidden' }),
      workflow
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardStages(context({ orders: 'hidden' }), workflow),
    []
  )
  const owner = context({}, { stageIds: ['new'] })
  owner.role = owner.staff.role = 'owner'
  assert.equal(getPartyOrderBoardStages(owner, workflow).length, 3)
})

test('moves honor transition grant and allowed role transitions, including handing off out of scope', () => {
  const actor = context({}, { stageIds: ['new'] })
  assert.deepEqual(
    getPartyOrderBoardTransitions(actor, workflow, order()).map(
      (stage) => stage.id
    ),
    ['prepare']
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      context({ 'orders.transition': 'hidden' }),
      workflow,
      order()
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      context({ 'orders.workflowStageId': 'hidden' }),
      workflow,
      order()
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(actor, workflow, order({ status: 'closed' })),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      actor,
      workflow,
      order({ status: 'canceled' })
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      actor,
      workflow,
      order({ updatedAt: 'invalid' })
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      actor,
      workflow,
      order({ workflowStageId: 'prepare' })
    ).map((stage) => stage.id),
    ['review']
  )
})

test('hidden system status requires the explicit server transition capability', () => {
  const actor = context()
  const hidden = order()
  delete hidden.status
  assert.deepEqual(getPartyOrderBoardTransitions(actor, workflow, hidden), [])
  assert.deepEqual(
    getPartyOrderBoardTransitions(actor, workflow, {
      ...hidden,
      workflowTransitionAvailable: false,
    }),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(actor, workflow, {
      ...hidden,
      workflowTransitionAvailable: true,
    }).map((stage) => stage.id),
    ['prepare']
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      actor,
      workflow,
      order({ workflowTransitionAvailable: false })
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      actor,
      workflow,
      order({ status: 'closed', workflowTransitionAvailable: true })
    ),
    []
  )
  assert.deepEqual(
    getPartyOrderBoardTransitions(
      context({ 'orders.transition': 'hidden' }),
      workflow,
      { ...hidden, workflowTransitionAvailable: true }
    ),
    []
  )
})

test('newest order version appears once across independently loaded columns and stays within visible scope', () => {
  const current = order({
    workflowStageId: 'prepare',
    updatedAt: '2026-10-29T11:00:00Z',
  })
  const columns = {
    new: { orders: [order()], nextCursor: 'cursor-a' },
    prepare: { orders: [current], nextCursor: null },
    review: {
      orders: [order({ _id: 'f'.repeat(24), workflowStageId: 'review' })],
    },
  }
  const before = structuredClone(columns)
  const all = projectPartyOrderBoardColumns(columns, workflow.stages, workflow)
  assert.deepEqual(all.new.orders, [])
  assert.deepEqual(all.prepare.orders, [current])
  assert.equal(Object.values(all).flatMap((column) => column.orders).length, 2)
  assert.equal(all.new.nextCursor, 'cursor-a')
  const restricted = projectPartyOrderBoardColumns(
    { new: { orders: [current] } },
    [workflow.stages[0]],
    workflow
  )
  assert.deepEqual(restricted.new.orders, [])
  assert.deepEqual(columns, before)
})

test('board preference remains isolated by staff and company with compatible list/calendar defaults', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  writePartyOrderViewPreference(
    tenantId,
    staffId,
    { view: 'board', calendarView: 'week' },
    storage
  )
  assert.deepEqual(readPartyOrderViewPreference(tenantId, staffId, storage), {
    view: 'board',
    calendarView: 'week',
  })
  assert.equal(
    readPartyOrderViewPreference('other', staffId, storage).view,
    'list'
  )
  assert.equal(
    readPartyOrderViewPreference(tenantId, 'other', storage).view,
    'list'
  )
  writePartyOrderViewPreference(
    tenantId,
    staffId,
    { view: 'calendar', calendarView: 'day' },
    storage
  )
  assert.deepEqual(readPartyOrderViewPreference(tenantId, staffId, storage), {
    view: 'calendar',
    calendarView: 'day',
  })
})

test('order deep link chooses its authorized company rather than the last browser preference', () => {
  const companies = [{ id: 'first' }, { id: 'second' }]
  const result = resolvePartyOrderDeepLink(
    new URLSearchParams({ companyId: 'second', orderId: order()._id }),
    { companies, fallbackCompanyId: 'first' }
  )
  assert.deepEqual(result, {
    companyId: 'second',
    orderId: order()._id,
    error: '',
  })
})

test('foreign company deep link never opens its order in the fallback company', () => {
  const result = resolvePartyOrderDeepLink(
    new URLSearchParams({ companyId: 'foreign', orderId: order()._id }),
    { companies: [{ id: 'first' }], fallbackCompanyId: 'first' }
  )
  assert.equal(result.companyId, 'first')
  assert.equal(result.orderId, '')
  assert.ok(result.error)
  const fixed = resolvePartyOrderDeepLink(
    new URLSearchParams({ companyId: 'second', orderId: order()._id }),
    { fixedCompanyId: 'first' }
  )
  assert.equal(fixed.orderId, '')
  assert.ok(fixed.error)
})

test('malformed order deep link is rejected while an ordinary workspace keeps its authorized company', () => {
  const options = { companies: [{ id: 'first' }], fallbackCompanyId: 'first' }
  assert.equal(
    resolvePartyOrderDeepLink(new URLSearchParams('orderId=invalid'), options)
      .orderId,
    ''
  )
  assert.ok(
    resolvePartyOrderDeepLink(new URLSearchParams('orderId=invalid'), options)
      .error
  )
  assert.deepEqual(resolvePartyOrderDeepLink(new URLSearchParams(), options), {
    companyId: 'first',
    orderId: '',
    error: '',
  })
})
