import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { nextPartyTaskOccurrence } from '../helpers/partyTasks.js'

const source = await readFile(new URL('./partyTaskScheduler.js', import.meta.url), 'utf8')
const stub = 'const unavailable = async () => { throw new Error("Real dependency must not run") }; const getPartyTaskModel = unavailable, withPartyTaskSeriesMutation = unavailable, getPartyCompanyModel = unavailable, getPartyOrderModel = unavailable, nextPartyTaskOccurrence = unavailable, syncPartyTaskEffects = unavailable, ensurePartyOrderTasks = unavailable;\n'
const { createPartyTaskScheduler } = await import(`data:text/javascript;base64,${Buffer.from(stub + source.replace(/^import .+$/gm, '')).toString('base64')}`)
const now = new Date('2026-10-27T00:00:00.000Z')
const query = (rows) => ({ sort() { return this }, select() { return this }, limit() { return this }, lean: async () => structuredClone(rows) })
const initial = (extra = {}) => ({ _id: 'root-a', tenantId: 'company-a', title: 'Повторяемая задача', status: 'done', revision: 1, recurrenceRevision: 0, seriesId: null, seriesActive: true, nextOccurrenceAt: now.toISOString(), recurrence: { frequency: 'daily', interval: 1, until: now.toISOString() }, timeZone: 'Asia/Krasnoyarsk', createdByStaffId: null, createdByUserId: 'dev-user', descriptionHtml: '<p>Описание</p>', assigneeStaffIds: ['staff-a'], ...extra })

function harness(extra = {}) {
  const state = { root: initial(extra.root), children: new Map(), calls: [], effects: [], transactionTail: Promise.resolve() }
  const session = { id: 'transaction' }
  const Tasks = {
    init: async () => {},
    find: (filter) => query(filter.seriesActive ? state.root.seriesActive ? [state.root] : [] : []),
    exists: (filter) => ({ session: async () => state.children.get(new Date(filter.occurrenceAt).toISOString())?.status === 'done' }),
    updateOne: async (filter, update, options = {}) => {
      assert.equal(options.session, session)
      if (filter.seriesId) {
        state.calls.push('insert-child')
        assert.equal(state.calls.includes('root-lock'), true)
        const key = new Date(filter.occurrenceAt).toISOString()
        if (state.children.has(key)) return { matchedCount: 1, modifiedCount: 0 }
        const child = { _id: `child-${state.children.size}`, ...structuredClone(update.$setOnInsert) }
        state.children.set(key, child)
        return { upsertedId: child._id, modifiedCount: 0 }
      }
      state.calls.push('move-cursor')
      Object.assign(state.root, update.$set || {})
      return { matchedCount: 1, modifiedCount: 1 }
    },
  }
  const mutateSeries = async ({ work }) => {
    const previous = state.transactionTail
    let release
    state.transactionTail = new Promise((resolve) => { release = resolve })
    await previous
    state.calls.push('root-lock')
    const snapshot = structuredClone(state.root)
    const children = new Map(state.children)
    try {
      if (extra.beforeTransaction) extra.beforeTransaction(state)
      return await work({ session, task: structuredClone(state.root), Tasks, rootId: state.root._id })
    } catch (error) { state.root = snapshot; state.children = children; throw error }
    finally { release() }
  }
  const run = createPartyTaskScheduler({ getTasks: async () => Tasks, getOrders: async () => ({ updateOne: async (_filter, _update, options) => { assert.equal(options.session, session); state.calls.push('order-lock'); return { matchedCount: extra.orderOpen === false ? 0 : 1 } } }), getCompanies: async () => ({ find: () => query([]) }), mutateSeries, nextOccurrence: nextPartyTaskOccurrence, syncEffects: async (effect) => { state.effects.push(effect); assert.equal(state.calls.includes('move-cursor'), true); return { failed: 0 } } })
  return { state, run }
}

test('generation commits cursor and child together and runs effects only after transaction completion', async () => {
  const h = harness({ root: { orderId: 'order-a' } })
  const result = await h.run({ now })
  assert.equal(result.generated, 1)
  assert.deepEqual(h.state.calls, ['root-lock', 'order-lock', 'insert-child', 'move-cursor'])
  assert.equal(h.state.root.seriesActive, false)
  assert.equal(h.state.effects.length, 1)
  assert.equal([...h.state.children.values()][0].createdByUserId, 'dev-user')
  assert.equal([...h.state.children.values()][0].createdByStaffId, null)
})

test('two concurrent scheduler invocations generate only one occurrence', async () => {
  const h = harness()
  const results = await Promise.all([h.run({ now }), h.run({ now })])
  assert.equal(results.reduce((sum, result) => sum + result.generated, 0), 1)
  assert.equal(h.state.children.size, 1)
  assert.equal(h.state.effects.length, 1)
})

test('a series stopped just before the transaction cannot create a future child', async () => {
  const h = harness({ beforeTransaction: (state) => { state.root.seriesActive = false; state.root.nextOccurrenceAt = null } })
  const result = await h.run({ now })
  assert.equal(result.generated, 0)
  assert.equal(h.state.children.size, 0)
  assert.equal(h.state.effects.length, 0)
})

test('canceled or closed orders stop generation before inserting any child', async () => {
  const h = harness({ root: { orderId: 'order-a' }, orderOpen: false })
  await h.run({ now })
  assert.equal(h.state.children.size, 0)
  assert.equal(h.state.root.seriesActive, false)
  assert.equal(h.state.calls.includes('insert-child'), false)
})

test('an existing completed occurrence remains completed when recovering a stale cursor', async () => {
  const h = harness()
  const completed = { _id: 'completed-child', status: 'done', completedByStaffId: 'first-completer', title: 'Прежняя версия' }
  h.state.children.set(now.toISOString(), structuredClone(completed))
  await h.run({ now })
  assert.deepEqual(h.state.children.get(now.toISOString()), completed)
  assert.equal(h.state.effects.length, 0)
})
