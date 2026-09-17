import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import * as financial from '../helpers/partyFinancialSettlements.js'
import * as snapshot from '../helpers/partyPayrollSnapshot.js'

// Exercise the actual service with session-aware storage doubles; no working DB.
const code = (await readFile(new URL('./partyPayrollStatements.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const context = { tenantId: 'company', role: 'owner', staff: { _id: 'manager' }, company: {} }
const periodKey = '2026-09-H1'
const settlement = (id, status = 'approved') => ({
  _id: id, tenantId: 'company', periodKey, status, orderId: `order-${id}`,
  staffId: id, eventDate: '2026-09-06T10:00:00Z', accrualKopecks: 1000,
  totals: { earned: 1000, paid: 0, balance: 1000 },
})
function setup() {
  const state = { settlements: [settlement('a')], statement: null }
  let activeSession, tail = Promise.resolve()
  const matches = (item, filter) => Object.entries(filter).every(([key, value]) =>
    value && typeof value === 'object' && '$ne' in value
      ? item[key] !== value.$ne : item[key] === value)
  const query = (get) => {
    let session
    const result = {
      session(value) { session = value; return this }, sort() { return this },
      async lean() { assert.ok(activeSession); assert.equal(session, activeSession); return structuredClone(get()) },
      then(resolve, reject) { return this.lean().then(resolve, reject) },
    }
    return result
  }
  const Statements = {
    init: async () => {},
    findOne: (filter) => query(() => state.statement && matches(state.statement, filter) ? state.statement : null),
    findOneAndUpdate(filter, update, options) {
      return query(() => {
        const current = state.statement
        if (current && !matches(current, filter)) return null
        if (!current && !options.upsert) return null
        state.statement = { ...(current || { _id: 'statement', tenantId: 'company', periodKey, ...update.$setOnInsert }), ...update.$set }
        return state.statement
      }).session(options.session)
    },
  }
  const Settlements = {
    find: (filter) => query(() => state.settlements.filter((item) => matches(item, filter))),
    countDocuments: (filter) => query(() => state.settlements.filter((item) => matches(item, filter)).length),
  }
  const deps = {
    ...financial, ...snapshot,
    getPartyPayrollStatementModel: async () => Statements,
    getPartyFinancialSettlementModel: async () => Settlements,
    getCompanyFinancialTimeZone: () => 'Asia/Krasnoyarsk',
    isFinancialManager: (ctx) => ctx.role === 'owner',
    enrichSettlements: async (items, { session }) => { assert.equal(session, activeSession); return items },
    withPartyFinancialTransaction: (tenantId, callback) => {
      assert.equal(tenantId, context.tenantId)
      const pending = tail.then(async () => {
        activeSession = {}
        try { return await callback(activeSession) } finally { activeSession = null }
      })
      tail = pending.catch(() => {})
      return pending
    },
  }
  const service = compileFunction(`${code}\nreturn { generatePartyPayrollStatement, changePartyPayrollStatementStatus }`, Object.keys(deps))(...Object.values(deps))
  return { state, generate: () => service.generatePartyPayrollStatement({ context, periodKey }),
    change: (action) => service.changePartyPayrollStatementStatus({ context, id: 'statement', action }) }
}

test('late approved settlement requires regeneration before approving payroll', async () => {
  const { state, generate, change } = setup()
  state.settlements.push(settlement('b', 'draft'))
  await generate()
  state.settlements[1].status = 'approved'
  await assert.rejects(change('approve'), { status: 409 })
  await generate()
  await change('approve')
  assert.equal(state.statement.lines.length, 2)
  state.settlements[0].totals.balance = 0
  await assert.rejects(change('mark_paid'), { status: 409 })
  state.settlements[1].totals.balance = 0
  await change('mark_paid')
  assert.equal(state.statement.status, 'paid')
})

test('approved historical statement cannot hide missing or additional period debts', async () => {
  const { state, generate, change } = setup()
  await generate(); await change('approve')
  state.settlements[0].totals.balance = 0
  state.settlements.push(settlement('b'))
  await assert.rejects(change('mark_paid'), { status: 409 })
  state.settlements = []
  await assert.rejects(change('mark_paid'), { status: 409 })
})

test('changed amounts require explicit regeneration of the reviewed draft', async () => {
  const { state, generate, change } = setup()
  await generate()
  state.settlements[0].totals.balance = 500
  await assert.rejects(change('approve'), { status: 409 })
  await generate(); await change('approve')
  assert.equal(state.statement.lines[0].totals.balance, 500)
})

test('regeneration shares approval lock and cannot overwrite an approved snapshot', async () => {
  const { state, generate, change } = setup()
  await generate()
  const results = await Promise.allSettled([change('approve'), generate()])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.equal(results[1].reason.status, 409)
  assert.equal(state.statement.status, 'approved')
})
