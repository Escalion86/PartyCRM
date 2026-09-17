import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'

const source = (await readFile(new URL('./partyRelatedOrders.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')

// Transactional storage double: exercises service rollback/CAS, not MongoDB transactions.
const setup = (count = 4) => {
  let state = { orders: Array.from({ length: count }, (_, index) => ({ _id: `o${index}`, tenantId: 'company', title: `Заказ ${index}`, status: 'active', partyEventGroupId: null })), groups: [] }
  let activeSession, serial = Promise.resolve(), nextGroup = 1
  const writes = []
  let rejectOrderWrite = false
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (value === null) return row[key] == null
    if (value && typeof value === 'object') {
      if ('$ne' in value) return row[key] !== value.$ne
      if ('$in' in value) return value.$in.includes(row[key])
      if ('$regex' in value) return new RegExp(value.$regex, value.$options).test(row[key])
    }
    return row[key] === value
  })
  const query = (get) => {
    let session
    return {
      session(value) { session = value; return this }, sort() { return this }, select() { return this }, limit() { return this },
      async lean() { if (activeSession) assert.equal(session, activeSession); return structuredClone(get()) },
      then(resolve, reject) { return this.lean().then(resolve, reject) },
    }
  }
  const model = (key) => ({
    init: async () => {},
    findOne: (filter) => query(() => state[key].find((row) => matches(row, filter)) || null),
    find: (filter) => query(() => state[key].filter((row) => matches(row, filter))),
    countDocuments: (filter) => query(() => state[key].filter((row) => matches(row, filter)).length),
    async create(rows, { session }) { assert.equal(session, activeSession); const created = rows.map((row) => ({ ...row, _id: `g${nextGroup++}` })); state[key].push(...created); return created },
    async updateOne(filter, update, { session }) {
      assert.equal(session, activeSession)
      assert.equal(filter.tenantId, 'company')
      writes.push({ key, filter, update })
      if (key === 'orders' && rejectOrderWrite) return { matchedCount: 0 }
      const row = state[key].find((item) => matches(item, filter))
      if (!row) return { matchedCount: 0 }
      Object.assign(row, update.$set)
      for (const [field, amount] of Object.entries(update.$inc || {})) row[field] = (row[field] || 0) + amount
      return { matchedCount: 1 }
    },
    async deleteOne(filter, { session }) { assert.equal(session, activeSession); state[key] = state[key].filter((row) => !matches(row, filter)); return { deletedCount: 1 } },
  })
  const deps = {
    getPartyEventGroupModel: async () => model('groups'), getPartyOrderModel: async () => model('orders'),
    getPartyTransactionModel: async () => ({ find: () => query(() => []) }),
    getPartyClientModel: async () => ({ find: () => query(() => []) }),
    getPartyLocationModel: async () => ({ find: () => query(() => []) }),
    buildPartyRelatedOrdersSummary: ({ orders }) => ({ orders, totals: {} }),
    withPartyFinancialTransaction: (tenantId, callback) => {
      assert.equal(tenantId, 'company')
      const operation = serial.then(async () => {
        const backup = structuredClone(state)
        activeSession = Symbol('session')
        try { return await callback(activeSession) } catch (error) { state = backup; throw error } finally { activeSession = null }
      })
      serial = operation.catch(() => {})
      return operation
    },
  }
  const api = compileFunction(`${source}\nreturn {linkPartyRelatedOrder, unlinkPartyRelatedOrder,getPartyRelatedOrders,updatePartySharedLocationBooking,getPartySharedLocationOrderIds}`, Object.keys(deps))(...Object.values(deps))
  return { api, writes, failOrderWrite: () => { rejectOrderWrite = true }, state: () => state, link: (input = {}) => api.linkPartyRelatedOrder({ tenantId: 'company', orderId: 'o0', targetOrderId: 'o1', expectedRevision: 0, ...input }), unlink: (input = {}) => api.unlinkPartyRelatedOrder({ tenantId: 'company', orderId: 'o0', expectedRevision: 1, ...input }) }
}

test('links existing orders without financial/booking writes, appends and dissolves', async () => {
  const s = setup()
  const { groupId } = await s.link({ title: ' Праздник ' })
  assert.equal(s.state().groups[0].title, 'Праздник')
  assert.equal(s.state().groups[0].revision, 1)
  assert.equal(s.state().orders[0].partyEventGroupId, groupId)
  await s.link({ targetOrderId: 'o2', expectedRevision: 1 })
  assert.equal(s.state().groups[0].revision, 2)
  await s.unlink({ expectedRevision: 2 })
  assert.equal(s.state().groups[0].revision, 3)
  assert.equal(s.state().orders[0].partyEventGroupId, null)
  await s.unlink({ orderId: 'o1', expectedRevision: 3 })
  assert.equal(s.state().groups.length, 0)
  assert.ok(s.state().orders.every((order) => order.partyEventGroupId === null))
  for (const write of s.writes.filter((write) => write.key === 'orders')) assert.ok(Object.keys(write.update.$set).every((key) => ['partyEventGroupId', 'sharedLocationBooking', 'updatedAt'].includes(key)))
})

test('stale revision leaves links unchanged', async () => {
  const s = setup()
  await s.link()
  const before = structuredClone(s.state())
  await assert.rejects(s.link({ targetOrderId: 'o2', expectedRevision: 0 }), { status: 409 })
  await assert.rejects(s.unlink({ expectedRevision: 0 }), { status: 409 })
  assert.deepEqual(s.state(), before)
})

test('failed member CAS rolls back newly created group and revision change', async () => {
  const fresh = setup()
  fresh.failOrderWrite()
  await assert.rejects(fresh.link(), { status: 409 })
  assert.equal(fresh.state().groups.length, 0)
  const existing = setup()
  await existing.link()
  const before = structuredClone(existing.state())
  existing.failOrderWrite()
  await assert.rejects(existing.link({ targetOrderId: 'o2', expectedRevision: 1 }), { status: 409 })
  assert.deepEqual(existing.state(), before)
})

test('concurrent claims of the same target produce one group without an orphan', async () => {
  const s = setup()
  const outcomes = await Promise.allSettled([s.link(), s.link({ orderId: 'o2' })])
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(s.state().groups.length, 1)
  assert.equal(s.state().orders.filter((order) => order.partyEventGroupId).length, 2)
})

test('rejects cross-tenant, canceled, self and invalid revision inputs', async () => {
  const s = setup()
  s.state().orders[1].tenantId = 'other'
  await assert.rejects(s.link(), { status: 404 })
  s.state().orders[1].tenantId = 'company'
  s.state().orders[1].status = 'canceled'
  await assert.rejects(s.link(), { status: 400 })
  await assert.rejects(s.link({ targetOrderId: 'o0' }), { status: 400 })
  await assert.rejects(s.link({ expectedRevision: undefined }), { status: 400 })
  assert.equal(s.state().groups.length, 0)
})

test('caps groups at twenty and refuses merging existing groups', async () => {
  const s = setup(22)
  await s.link()
  for (let index = 2; index < 20; index++) await s.link({ targetOrderId: `o${index}`, expectedRevision: index - 1 })
  await assert.rejects(s.link({ targetOrderId: 'o20', expectedRevision: 19 }), { status: 400 })
  await s.link({ orderId: 'o20', targetOrderId: 'o21' })
  await assert.rejects(s.link({ targetOrderId: 'o20', expectedRevision: 19 }), { status: 409 })
})

test('physical deletion leaving singleton remains readable and can be unlinked', async () => {
  const s = setup()
  await s.link()
  s.state().orders = s.state().orders.filter((order) => order._id !== 'o1')
  const result = await s.api.getPartyRelatedOrders({ tenantId: 'company', orderId: 'o0' })
  assert.equal(result.group.orders.length, 1)
  await s.unlink()
  assert.equal(s.state().groups.length, 0)
})

test('candidate search treats regex literally and excludes linked/canceled/foreign orders', async () => {
  const s = setup(5)
  s.state().orders[1].title = 'Заказ [VIP]'
  s.state().orders[2].status = 'canceled'
  s.state().orders[3].tenantId = 'other'
  s.state().orders[4].partyEventGroupId = 'existing'
  const result = await s.api.getPartyRelatedOrders({ tenantId: 'company', orderId: 'o0', search: '[VIP]' })
  assert.equal(result.group, null)
  assert.deepEqual(result.candidates.map((row) => row._id), ['o1'])
})

const toggle = (s, input = {}) => s.api.updatePartySharedLocationBooking({ tenantId: 'company', orderId: 'o0', sharedLocationBooking: true, expectedRevision: 1, ...input })
const overlap = (s) => {
  for (const order of s.state().orders.slice(0, 2)) Object.assign(order, { placeType: 'company_location', locationId: 'loc', eventDate: '2026-10-01T10:00:00Z', dateEnd: '2026-10-01T11:00:00Z' })
}

test('sharing defaults off; explicit toggle exposes only server tenant group IDs and touches all members', async () => {
  const s = setup()
  overlap(s)
  await s.link()
  assert.deepEqual(await s.api.getPartySharedLocationOrderIds({ tenantId: 'company', orderId: 'o0' }), [])
  await toggle(s)
  assert.deepEqual(await s.api.getPartySharedLocationOrderIds({ tenantId: 'company', orderId: 'o0' }), ['o0', 'o1'])
  assert.deepEqual(await s.api.getPartySharedLocationOrderIds({ tenantId: 'other', orderId: 'o0' }), [])
  const view = await s.api.getPartyRelatedOrders({ tenantId: 'company', orderId: 'o0' })
  assert.equal(view.group.sharedLocationBooking, true)
  for (const order of s.state().orders.slice(0, 2)) {
    assert.equal(order.sharedLocationBooking, true)
    assert.equal(order.sharedLocationRevision, 2)
  }
  s.state().groups[0].tenantId = 'other'
  assert.deepEqual(await s.api.getPartySharedLocationOrderIds({ tenantId: 'company', orderId: 'o0' }), [])
})

test('disable/unlink reject overlapping venue and preserve state; cancellation releases it', async () => {
  const s = setup()
  await s.link()
  await toggle(s)
  overlap(s)
  const before = structuredClone(s.state())
  await assert.rejects(toggle(s, { sharedLocationBooking: false, expectedRevision: 2 }), { status: 409 })
  await assert.rejects(s.unlink({ expectedRevision: 2 }), { status: 409 })
  assert.deepEqual(s.state(), before)
  s.state().orders[1].status = 'canceled'
  await s.unlink({ expectedRevision: 2 })
  assert.equal(s.state().groups.length, 0)
  for (const order of s.state().orders.slice(0, 2)) assert.equal(order.sharedLocationBooking, false)
})

test('adjacent intervals and different locations do not prevent disabling', async () => {
  for (const mode of ['adjacent', 'different', 'closed', 'client_address']) {
    const s = setup()
    await s.link()
    await toggle(s)
    overlap(s)
    const second = s.state().orders[1]
    if (mode === 'adjacent') second.eventDate = '2026-10-01T11:00:00Z'
    if (mode === 'different') second.locationId = 'another'
    if (mode === 'closed') second.status = 'closed'
    if (mode === 'client_address') second.placeType = 'client_address'
    await toggle(s, { sharedLocationBooking: false, expectedRevision: 2 })
    assert.equal(s.state().groups[0].sharedLocationBooking, false)
  }
})

test('toggle checks revision, strict boolean, member-write rollback', async () => {
  const s = setup()
  await s.link()
  const before = structuredClone(s.state())
  await assert.rejects(toggle(s, { expectedRevision: 0 }), { status: 409 })
  await assert.rejects(toggle(s, { sharedLocationBooking: 'true' }), { status: 400 })
  s.failOrderWrite()
  await assert.rejects(toggle(s), { status: 409 })
  assert.deepEqual(s.state(), before)
})

test('new member inherits flag and all peers get revision; unlink checks departing pairs only', async () => {
  const s = setup()
  await s.link()
  await toggle(s)
  overlap(s)
  await s.link({ targetOrderId: 'o2', expectedRevision: 2 })
  assert.equal(s.state().orders[2].sharedLocationBooking, true)
  assert.equal(s.state().orders[1].sharedLocationRevision, 3)
  await s.unlink({ orderId: 'o2', expectedRevision: 3 })
  assert.equal(s.state().orders[2].sharedLocationBooking, false)
  assert.equal(s.state().orders[1].sharedLocationRevision, 4)
  assert.equal(s.state().groups[0].sharedLocationBooking, true)
})
