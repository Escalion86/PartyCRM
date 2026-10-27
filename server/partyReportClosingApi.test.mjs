import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess, buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { maskPartyOrderBlockers, maskPartyOrderFinancialSummary } from '../helpers/partyOrderAccess.js'

const tenantId = 'a'.repeat(24), orderId = 'b'.repeat(24), staffId = 'c'.repeat(24)
const context = { tenantId, role: 'owner', staff: { _id: staffId, tenantId, role: 'owner', status: 'active' } }
const order = { _id: orderId, tenantId, status: 'active', sharedLocationRevision: 2, commercialRevision: 3, eventBrief: { customAnswers: { wishes: 'Тихая музыка' } } }
const snapshot = { ...order.eventBrief, templateSnapshot: { revision: 7, title: 'Бриф', fields: [{ id: 'wishes' }] } }
const source = async (file) => (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export const ', 'const ')
const batchCode = await source('../app/api/party/orders/close-past/route.js')
const locationCode = await source('./partyLocationTransactions.js')

function setup({ blocked = false, tasksBlocked = false, stale = false, denied = false } = {}) {
  const session = {}, calls = [], writes = []
  const query = (value, selectedSession) => ({ session(selected) { assert.equal(selected, session); return this }, lean: async () => { if (selectedSession) assert.equal(selectedSession, session); return value } })
  const deps = {
    canPartyAccess: denied ? () => false : canPartyAccess, buildPartyOrderAccessFilter, getPartyOrderWriteGuard, maskPartyOrderBlockers, maskPartyOrderFinancialSummary,
    getPartyRequestContext: async () => ({ context }),
    NextResponse: { json: (body) => ({ status: 200, body }) },
    partyError: (status, code, message) => ({ status, code, message }),
    withPartyFinancialTransaction: async (tenant, callback) => { assert.equal(tenant, tenantId); calls.push('financial-lock'); const result = await callback(session); calls.push('commit'); return result },
    getPartyOrderModel: async () => ({
      db: { startSession: async () => ({ withTransaction: async (callback) => { calls.push('transaction'); await callback(); calls.push('commit') }, endSession: async () => {} }) },
      find: (filter) => { assert.equal(filter.tenantId, tenantId); return query([order]) },
      findOne: (filter) => { assert.equal(filter.tenantId, tenantId); assert.equal(filter._id, orderId); assert.equal(filter.status, order.status); return query(stale ? null : order) },
      findOneAndUpdate: (filter, update, options) => {
        assert.equal(filter.tenantId, tenantId)
        assert.equal(options.session, session)
        if (update.$inc.locationFinanceRevision) { calls.push('order-lock'); return query(order) }
        assert.equal(filter.sharedLocationRevision ?? filter.$and?.[0]?.sharedLocationRevision, order.sharedLocationRevision)
        writes.push(update)
        calls.push('close')
        return query({ ...order, ...update.$set })
      },
      updateOne: async (filter, update, options) => { assert.equal(filter.tenantId, tenantId); assert.equal(options.session, session); calls.push('close'); writes.push(update); return { matchedCount: 1 } },
    }),
    getPartyTransactionModel: async () => ({ find: (filter) => { assert.equal(filter.tenantId, tenantId); return query([]) } }),
    getPartyTaskOrderReadiness: async (options) => { assert.equal(options.session, session); assert.equal(options.tenantId, tenantId); calls.push('tasks'); return { order: { ...order, canonicalTasksChecked: true }, blockers: tasksBlocked ? [{ code: 'open_assigned_tasks', message: 'Есть открытая задача' }] : [] } },
    getPartyOrderCloseReadiness: ({ order: checked }) => { assert.equal(checked.canonicalTasksChecked, true); calls.push('readiness'); return { ok: true, blockers: [], summary: { grossMargin: 100 } } },
    assertPartyReportGate: async (options) => { assert.equal(options.tenantId, tenantId); assert.equal(options.order, order); assert.equal(options.action, 'close'); assert.equal(options.session, session); calls.push('report-gate'); if (blocked) throw Object.assign(new Error('Обязательный отчёт не принят'), { status: 409, code: 'partycrm_report_required' }) },
    snapshotPartyBriefForClose: async (options) => { assert.equal(options.tenantId, tenantId); assert.equal(options.order, order); calls.push('brief-snapshot'); return snapshot },
    recordPartyOrderAudit: async () => { assert.equal(calls.includes('commit'), true); calls.push('audit') },
    syncPartyOrderCalendarAfterCrud: async () => { assert.equal(calls.includes('commit'), true); calls.push('calendar') },
    lockLocationMembership: async () => calls.push('membership-lock'),
    buildLocationOrderFilter: (_context, filter) => ({ tenantId, ...filter }),
    requireLocationObjectId: (id) => id,
    locationFailure: (message, status = 400) => { throw Object.assign(new Error(message), { status }) },
  }
  // Location sessions are created by the service rather than the financial helper.
  const getModel = deps.getPartyOrderModel
  deps.getPartyOrderModel = async () => {
    const model = await getModel()
    model.db.startSession = async () => Object.assign(session, { withTransaction: async (callback) => { calls.push('transaction'); await callback(); calls.push('commit') }, endSession: async () => {} })
    return model
  }
  const batch = new Function(...Object.keys(deps), `${batchCode}\nreturn POST`)(...Object.values(deps))
  const location = new Function(...Object.keys(deps), `${locationCode}\nreturn closeLocationOrder`)(...Object.values(deps))
  return { calls, writes, batch: () => batch({}), location: () => location({ context, orderId }) }
}

test('bulk close checks current tasks and reports in the financial transaction, freezes brief and keeps summary', async () => {
  const run = setup()
  const result = await run.batch()
  assert.equal(result.body.data.closedCount, 1)
  assert.equal(result.body.data.closed[0].summary.grossMargin, 100)
  assert.deepEqual(run.writes[0].$set, { status: 'closed', eventBrief: snapshot })
  assert.ok(run.calls.indexOf('report-gate') < run.calls.indexOf('close'))
  assert.ok(run.calls.indexOf('brief-snapshot') < run.calls.indexOf('close'))
  assert.equal(order.eventBrief.templateSnapshot, undefined)
})

test('bulk close skips a blocked report, open task or concurrent order change without status writes', async () => {
  for (const options of [{ blocked: true }, { tasksBlocked: true }, { stale: true }]) {
    const run = setup(options)
    const result = await run.batch()
    assert.equal(result.body.data.closedCount, 0)
    assert.equal(result.body.data.skipped.length, 1)
    assert.equal(run.writes.length, 0)
  }
  assert.equal((await setup({ denied: true }).batch()).status, 403)
})

test('location close uses the same report and canonical task gates and preserves an immutable brief', async () => {
  const run = setup()
  await run.location()
  assert.equal(run.writes.length, 1)
  assert.deepEqual(run.writes[0].$set, { status: 'closed', eventBrief: snapshot })
  const blocked = setup({ blocked: true })
  await assert.rejects(blocked.location(), { status: 409 })
  assert.equal(blocked.writes.length, 0)
  const tasks = setup({ tasksBlocked: true })
  await assert.rejects(tasks.location(), { status: 409 })
  assert.equal(tasks.writes.length, 0)
})
