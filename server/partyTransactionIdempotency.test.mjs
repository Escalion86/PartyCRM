import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  normalizePartyTransactionPayload,
  serializePartyTransaction,
} from './partyTransactionsCore.js'
import { buildPartyTransactionRequestIdentity } from './partyTransactionIdempotency.js'
import { canAccessPartyTransaction } from './partyTransactionAccess.js'

const strip = (source) =>
  source
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export async function ', 'async function ')
    .replaceAll('export const ', 'const ')
const [postSource, financialSource, modelSource] = await Promise.all(
  [
    '../app/api/party/transactions/route.js',
    './partyFinancialSettlements.js',
    './partyModels.js',
  ].map(async (path) => await readFile(new URL(path, import.meta.url), 'utf8'))
)
const tenantId = 'a'.repeat(24),
  orderId = 'b'.repeat(24),
  staffId = 'c'.repeat(24)
const key = 'e04e1e6e-94c5-4eaa-871f-41eb43e98a0a'
const context = {
  tenantId,
  role: 'performer',
  staff: { _id: staffId, tenantId, role: 'performer', status: 'active' },
  position: {
    permissions: {
      orders: 'read',
      'finance.payouts': 'edit',
      'finance.payments': 'edit',
      'finance.expenses': 'edit',
    },
  },
}
const payload = {
  orderId,
  type: 'expense',
  category: 'payout',
  staffId,
  amount: '1500.50',
  date: '2026-10-27T10:00:00Z',
  comment: 'Оплата',
  paymentMethod: 'transfer',
}

const setup = () => {
  const records = [],
    calls = {
      init: 0,
      sessionStarts: 0,
      creates: 0,
      touches: 0,
      audits: 0,
      calendars: 0,
      gates: 0,
    }
  let sequence = 0,
    mutex = Promise.resolve(),
    blocked = false
  const order = {
    _id: orderId,
    tenantId,
    status: 'active',
    assignedStaff: [{ staffId }],
  }
  const financialError = (message, status = 400) =>
    Object.assign(new Error(message), { status })
  const Lock = {
    init: async () => {},
    updateOne: async (_filter, update, options) => {
      if (!update.$inc) return
      const previous = mutex
      let release
      mutex = new Promise((resolve) => {
        release = resolve
      })
      await previous
      options.session.release = release
      options.session.active = true
    },
    db: {
      startSession: async () => {
        calls.sessionStarts += 1
        const session = {
          active: false,
          endSession: async () => {},
          async withTransaction(callback) {
            try {
              return await callback()
            } finally {
              this.active = false
              this.release?.()
            }
          },
        }
        return session
      },
    },
  }
  // Execute the production transaction wrapper. Its real financial-lock write
  // acquires this storage double's mutex before the concurrent callback runs.
  const txnDeps = {
    getPartyFinancialLockModel: async () => Lock,
    isFinancialId: () => true,
    financialError,
  }
  const withPartyFinancialTransaction = new Function(
    ...Object.keys(txnDeps),
    `${strip(financialSource)}\nreturn withPartyFinancialTransaction`
  )(...Object.values(txnDeps))
  const q = (read) => {
    let session
    return {
      session(value) {
        session = value
        return this
      },
      async lean() {
        assert.equal(session.active, true)
        await Promise.resolve()
        return read()
      },
    }
  }
  const Transactions = {
    init: async () => {
      calls.init += 1
      assert.equal(calls.init >= calls.sessionStarts, true)
    },
    findOne: (filter) =>
      q(
        () =>
          records.find((row) =>
            Object.entries(filter).every(
              ([name, value]) => String(row[name]) === String(value)
            )
          ) || null
      ),
    create: async (rows, { session }) => {
      assert.equal(session.active, true)
      for (const row of rows)
        if (
          row.idempotencyKey &&
          records.some(
            (old) =>
              old.tenantId === row.tenantId &&
              old.idempotencyActorId === row.idempotencyActorId &&
              old.idempotencyKey === row.idempotencyKey
          )
        )
          throw Object.assign(new Error('Duplicate index'), { code: 11000 })
      const result = rows.map((row) => ({
        ...row,
        _id: (++sequence).toString(16).padStart(24, '0'),
      }))
      calls.creates += result.length
      records.push(...result)
      return result
    },
  }
  const deps = {
    normalizePartyTransactionPayload,
    serializePartyTransaction,
    buildPartyTransactionRequestIdentity,
    withPartyFinancialTransaction,
    canAccessPartyTransaction,
    NextResponse: {
      json: (body, options) => ({ status: options?.status || 200, body }),
    },
    getPartyRequestContext: async ({ req }) => ({ context: req.actor }),
    parseJsonBody: async (req) => req.body,
    isValidObjectId: (value) => /^[a-f\d]{24}$/.test(value),
    partyError: (status, code, message) => ({
      status,
      body: { error: { code, message } },
    }),
    validatePartyPayoutTransactionStaff: () => ({}),
    getPartyOrderModel: async () => ({
      findOne: (filter) =>
        q(() => (filter.tenantId === order.tenantId ? order : null)),
      updateOne: async (_filter, _update, { session }) => {
        assert.equal(session.active, true)
        calls.touches += 1
      },
    }),
    getPartyTransactionModel: async () => Transactions,
    assertPartyReportGate: async ({ session }) => {
      assert.equal(session.active, true)
      calls.gates += 1
      if (blocked)
        throw Object.assign(new Error('Отчёт не принят'), {
          status: 409,
          code: 'partycrm_report_required',
        })
    },
    recordPartyOrderAudit: async () => {
      calls.audits += 1
    },
    syncPartyOrderCalendarAfterCrud: async () => {
      calls.calendars += 1
    },
  }
  const post = new Function(
    ...Object.keys(deps),
    `${strip(postSource)}\nreturn POST`
  )(...Object.values(deps))
  return {
    records,
    calls,
    order,
    blockReport: () => {
      blocked = true
    },
    send: (body = payload, actor = context, requestKey = key) =>
      post({
        body,
        actor,
        headers: new Headers(
          requestKey === null ? {} : { 'Idempotency-Key': requestKey }
        ),
      }),
  }
}

test('same request replays the same transaction without repeating ledger writes, gates or side effects', async () => {
  const instance = setup()
  const first = await instance.send()
  instance.blockReport()
  const replay = await instance.send()
  assert.equal(first.status, 201)
  assert.equal(replay.status, 201)
  assert.deepEqual(replay.body.data, first.body.data)
  assert.equal(replay.body.replayed, true)
  assert.equal('idempotencyKey' in replay.body.data, false)
  assert.deepEqual(instance.calls, {
    init: 2,
    sessionStarts: 2,
    creates: 1,
    touches: 1,
    audits: 1,
    calendars: 1,
    gates: 1,
  })
})

test('concurrent same-key requests serialize before lookup; changed payload is a 409 without another payout', async () => {
  const instance = setup()
  const responses = await Promise.all([
    instance.send(),
    instance.send(),
    instance.send({ ...payload, amount: '1600.00' }),
  ])
  assert.deepEqual(
    responses.map((response) => response.status),
    [201, 201, 409]
  )
  assert.equal(responses[0].body.data._id, responses[1].body.data._id)
  assert.equal(
    responses[2].body.error.code,
    'partycrm_transaction_idempotency_conflict'
  )
  assert.equal(instance.records.length, 1)
  assert.equal(instance.calls.touches, 1)
  assert.equal(instance.calls.gates, 1)
})

test('a replay still requires current write grants and the order scope, including the saved transaction category', async () => {
  const instance = setup()
  await instance.send()
  for (const actor of [
    {
      ...context,
      position: { permissions: { orders: 'read', 'finance.payouts': 'read' } },
    },
    {
      ...context,
      position: {
        ...context.position,
        orderScope: { stageIds: ['inaccessible-stage'] },
      },
    },
    { ...context, staff: { ...context.staff, status: 'paused' } },
  ])
    assert.equal((await instance.send(payload, actor)).status, 403)
  instance.records[0].category = 'materials'
  instance.records[0].staffId = null
  const onlyPayout = {
    ...context,
    position: { permissions: { orders: 'read', 'finance.payouts': 'edit' } },
  }
  assert.equal((await instance.send(payload, onlyPayout)).status, 403)
  assert.equal(instance.records.length, 1)
  assert.equal(instance.calls.creates, 1)
})

test('request keys belong to the current actor; old callers without a key keep their behavior', async () => {
  const instance = setup()
  const otherId = 'd'.repeat(24)
  const other = { ...context, staff: { ...context.staff, _id: otherId } }
  await instance.send()
  await instance.send(payload, other)
  assert.equal(instance.records.length, 2)
  assert.deepEqual(
    instance.records.map((row) => row.idempotencyActorId),
    [staffId, otherId]
  )
  const legacy = setup()
  await legacy.send(payload, context, null)
  await legacy.send(payload, context, null)
  assert.equal(legacy.records.length, 2)
  assert.equal(legacy.calls.init, 0)
  assert.equal(
    legacy.records.some((row) => row.idempotencyKey),
    false
  )
})

test('invalid keys and dates fail before opening a transaction or initializing indexes', async () => {
  for (const [body, requestKey] of [
    [payload, 'bad key'],
    [{ ...payload, date: 'not-a-date' }, key],
  ]) {
    const instance = setup()
    assert.equal((await instance.send(body, context, requestKey)).status, 400)
    assert.equal(instance.calls.sessionStarts, 0)
    assert.equal(instance.calls.init, 0)
  }
})

test('fingerprints normalize equivalent money and dates, preserve omitted-date retries and distinguish tenants', () => {
  const identity = (body, tenant = tenantId) =>
    buildPartyTransactionRequestIdentity({
      key,
      tenantId: tenant,
      actorId: staffId,
      body,
      payload: normalizePartyTransactionPayload(body),
    })
  assert.equal(
    identity(payload).requestFingerprint,
    identity({ ...payload, amount: 1500.5, date: '2026-10-27T13:00:00+03:00' })
      .requestFingerprint
  )
  const withoutDate = { ...payload }
  delete withoutDate.date
  const first = normalizePartyTransactionPayload(withoutDate),
    later = { ...first, date: new Date('2099-01-01T00:00:00Z') }
  assert.equal(
    buildPartyTransactionRequestIdentity({
      key,
      tenantId,
      actorId: staffId,
      body: withoutDate,
      payload: first,
    }).requestFingerprint,
    buildPartyTransactionRequestIdentity({
      key,
      tenantId,
      actorId: staffId,
      body: withoutDate,
      payload: later,
    }).requestFingerprint
  )
  assert.notEqual(
    identity(payload).requestFingerprint,
    identity(payload, 'another-company').requestFingerprint
  )
})

test('the real transaction model configures a partial tenant+actor+key unique index', () => {
  const portion = modelSource.slice(
    modelSource.indexOf('export const getPartyTransactionModel'),
    modelSource.indexOf('export const getPartyServiceGroupModel')
  )
  const factory = new Function(
    'getProductModel',
    'PRODUCTS',
    'partyTransactionsSchema',
    `${strip(portion)}\nreturn getPartyTransactionModel`
  )((options) => options, { PARTYCRM: 'partycrm' }, {})
  const indexes = []
  factory().configureSchema({ index: (...args) => indexes.push(args) })
  const [fields, options] = indexes.find(
    ([, options]) => options?.name === 'party_transaction_request_idempotency'
  )
  assert.deepEqual(fields, {
    tenantId: 1,
    idempotencyActorId: 1,
    idempotencyKey: 1,
  })
  assert.equal(options.unique, true)
  assert.deepEqual(options.partialFilterExpression, {
    idempotencyKey: { $type: 'string' },
    idempotencyActorId: { $type: 'string' },
  })
})
