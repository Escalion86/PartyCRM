import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  canPartyAccess,
  filterPartyOrderForAccess,
} from '../helpers/partyRolePermissions.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { getPartyOrderPermanentDeleteBlocker } from './partyOrderPermanentDelete.js'

const source = (
  await readFile(
    new URL('./partyOrderCreatePayment.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const deps = {
  createHash,
  canPartyAccess,
  parsePartyIsoDate,
  getPartyOrderModel: () => {},
  getPartyTransactionModel: () => {},
  withPartyFinancialTransaction: () => {},
  withPartyOrderVenueWrite: () => {},
  supportsPartyVenueTransactions: async () => true,
}
const {
  createPartyOrderPaymentService,
  parsePartyInitialPayment,
  buildPartyOrderCreateIdentity,
} = new Function(
  ...Object.keys(deps),
  `${source}\nreturn { createPartyOrderPaymentService, parsePartyInitialPayment, buildPartyOrderCreateIdentity }`
)(...Object.values(deps))
const tenantId = 'a'.repeat(24),
  actorId = 'b'.repeat(24)
const context = {
  tenantId,
  role: 'owner',
  staff: { _id: actorId, tenantId, role: 'owner', status: 'active' },
}
const payment = parsePartyInitialPayment({
  amount: '500.01',
  paymentMethod: 'cash',
})
const payload = {
  serviceTitle: 'Праздник',
  contractAmount: 1000,
  transactions: [],
  clientPayment: {},
}
const identity = buildPartyOrderCreateIdentity({
  key: 'request_key_123',
  context,
  body: { ...payload, initialPayment: payment },
})
const setup = ({ failPayment = false, venueConflict = false } = {}) => {
  let records = [],
    payments = [],
    serial = Promise.resolve(),
    counter = 0
  const calls = [],
    active = new Set()
  const Orders = {
    init: async () => {},
    findOne: (filter) => ({
      session: () => ({
        lean: async () =>
          records.find((order) =>
            Object.entries(filter).every(
              ([key, value]) => String(order[key]) === String(value)
            )
          ) || null,
      }),
    }),
    create: async ([record], { session }) => {
      assert.ok(active.has(session))
      const created = { ...record, _id: String(++counter) }
      records.push(created)
      calls.push('order')
      return [created]
    },
  }
  const service = createPartyOrderPaymentService({
    getOrders: async () => Orders,
    getTransactions: async () => ({
      create: async ([record], { session }) => {
        assert.ok(active.has(session))
        if (failPayment) throw Error('receipt failed')
        payments.push(record)
        calls.push('payment')
      },
    }),
    financialTransaction: (tenant, callback) => {
      assert.equal(tenant, tenantId)
      const run = serial.then(async () => {
        const before = structuredClone({ records, payments }),
          session = Symbol('transaction')
        active.add(session)
        try {
          return await callback(session)
        } catch (error) {
          ;({ records, payments } = before)
          throw error
        } finally {
          active.delete(session)
        }
      })
      serial = run.catch(() => {})
      return run
    },
    venueWrite: async ({ session, tenantId: tenant, work }) => {
      assert.equal(tenant, tenantId)
      assert.ok(active.has(session))
      calls.push('venue-lock')
      const result = await work({ session })
      if (venueConflict) throw Object.assign(Error('occupied'), { status: 409 })
      calls.push('venue-reserve')
      return result
    },
  })
  return {
    service,
    calls,
    get records() {
      return records
    },
    get payments() {
      return payments
    },
    create: (overrides = {}) =>
      service.create({
        context,
        identity,
        payment,
        payload,
        checkConflicts: async () => {
          calls.push('staff-check')
        },
        ...overrides,
      }),
  }
}

test('order, manual advance and venue use one transaction; concurrent retry saves exactly once', async () => {
  const state = setup()
  const results = await Promise.all([state.create(), state.create()])
  assert.equal(state.records.length, 1)
  assert.equal(state.payments.length, 1)
  assert.equal(state.payments[0].amount, 500.01)
  assert.equal(state.payments[0].orderId, state.records[0]._id)
  assert.deepEqual(
    results.map((row) => row.replayed),
    [false, true]
  )
  assert.deepEqual(state.calls, [
    'venue-lock',
    'staff-check',
    'order',
    'payment',
    'venue-reserve',
  ])
  assert.equal(state.records[0].clientPayment.prepaidAmount, 500.01)
})
test('receipt or venue failure rolls back both order and payment', async () => {
  for (const settings of [{ failPayment: true }, { venueConflict: true }]) {
    const state = setup(settings)
    await assert.rejects(state.create())
    assert.equal(state.records.length, 0)
    assert.equal(state.payments.length, 0)
  }
})
test('replay is actor and tenant scoped and rejects another body with the same key', async () => {
  const state = setup()
  await state.create()
  await assert.rejects(
    state.create({
      identity: { ...identity, createRequestFingerprint: 'changed' },
    }),
    { status: 409 }
  )
  assert.equal(
    await state.service.replay({
      context: { ...context, tenantId: 'other' },
      identity,
    }),
    null
  )
  const safe = filterPartyOrderForAccess(context, state.records[0])
  assert.doesNotMatch(JSON.stringify(safe), /createRequest/)
})
test('initial advance requires explicit financial rights, a positive exact amount and a valid instant', async () => {
  for (const amount of ['0', '-1', '12.345', 'Infinity', null, {}, true])
    assert.throws(() =>
      parsePartyInitialPayment({ amount, paymentMethod: 'cash' })
    )
  for (const date of [
    '2026-02-30T10:00:00Z',
    '2026-01-01',
    '2026-01-01T25:00:00Z',
    '2026-01-01T10:00:00+15:00',
  ])
    assert.throws(() =>
      parsePartyInitialPayment({ amount: 1, paymentMethod: 'cash', date })
    )
  assert.equal(
    parsePartyIsoDate('2024-02-29T10:00:00+07:00').toISOString(),
    '2024-02-29T03:00:00.000Z'
  )
  const state = setup()
  const scoped = {
    ...context,
    role: 'performer',
    staff: { ...context.staff, role: 'performer' },
    position: { permissions: { orders: 'read', 'finance.payments': 'read' } },
  }
  await assert.rejects(state.create({ context: scoped }), { status: 403 })
  await assert.rejects(
    state.create({ payment: { ...payment, amount: 1001 } }),
    { status: 400 }
  )
  await assert.rejects(
    state.create({ payload: { ...payload, transactions: [{ amount: 1 }] } }),
    { status: 400 }
  )
  assert.equal(state.records.length, 0)
})

test('an advance-backed order rejects permanent DELETE and the original operation replays the same order', async () => {
  const state = setup()
  const created = await state.create()
  const route = (
    await readFile(
      new URL('../app/api/party/orders/[id]/route.js', import.meta.url),
      'utf8'
    )
  )
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replace(/^export /gm, '')
  const dependencies = {
    getPartyRequestContext: async () => ({ context }),
    isValidObjectId: () => true,
    getPartyOrderModel: async () => ({
      findOne: () => ({ lean: async () => created.order }),
      findOneAndDelete: () =>
        assert.fail('Initial-payment identity must survive DELETE'),
    }),
    getPartyTransactionModel: () =>
      assert.fail('Durable identity remains protected without the receipt'),
    canPartyAccess,
    getPartyOrderPermanentDeleteBlocker,
    partyError: (status, code) => ({ status, code }),
  }
  const DELETE = new Function(
    ...Object.keys(dependencies),
    `${route}\nreturn DELETE`
  )(...Object.values(dependencies))
  const response = await DELETE(
    { url: 'http://partycrm.test/api/party/orders/1?permanent=true' },
    { params: Promise.resolve({ id: created.order._id }) }
  )
  assert.equal(response.status, 409)
  const replay = await state.create()
  assert.equal(replay.replayed, true)
  assert.equal(replay.order._id, created.order._id)
  assert.equal(state.payments.length, 1)
})
