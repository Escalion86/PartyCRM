import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { createHash } from 'node:crypto'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { getInitialPartyAssignmentConfirmationStatus } from '../helpers/partyOrderAssignments.js'
import { canPartyOperationalPermission } from '../helpers/partyOperationalPermissions.js'

const source = (await readFile(new URL('./partyOrderTeam.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const id = (n) => String(n).padStart(24, '0')
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$expr') return JSON.stringify(row.assignedStaff) === JSON.stringify(value.$eq[1].$literal)
  if (key === '$or') return value.some((f) => match(row, f))
  if (key === '$and') return value.every((f) => match(row, f))
  if (value?.$in) return value.$in.includes(row[key])
  if (value?.$lt) return String(row[key]) < value.$lt
  if (value && typeof value === 'object' && '$exists' in value) return (row[key] !== undefined) === value.$exists
  return JSON.stringify(row[key]) === JSON.stringify(value)
})
const context = (role = 'performer', permissions = ['orders.assignments']) => ({ tenantId: 'a', role, staff: { _id: id(8), tenantId: 'a', status: 'active', role, operationalPermissions: permissions } })
const setup = () => {
  const rows = [{ _id: id(1), tenantId: 'a', title: 'Праздник', status: 'active', commercialRevision: 0, updatedAt: 'now', sharedLocationRevision: 0, contractAmount: 100, client: { phone: 'secret' }, assignedStaff: [{ staffId: id(8), role: 'performer', confirmationStatus: 'confirmed', payoutAmount: 400, payoutStatus: 'ready', report: { text: 'secret report' }, performerGoogleCalendarEventId: 'event' }] }]
  const staff = [{ _id: id(8), tenantId: 'a', status: 'paused', firstName: 'Старый' }, { _id: id(9), tenantId: 'a', status: 'active', firstName: 'Новый', authUserId: id(99) }, { _id: id(10), tenantId: 'a', status: 'active', firstName: 'Без аккаунта' }, { _id: id(11), tenantId: 'b', status: 'active' }]
  let ctx = context(), race, conflict = false, failHooks = false, writes = 0
  const calls = []
  const query = (value) => ({ select() { return this }, sort() { return this }, limit(n) { value = value.slice(0, n); return this }, lean: async () => structuredClone(value) })
  const Orders = {
    find: (f) => { calls.push(['find', f]); return query(rows.filter((r) => match(r, f)).sort((a, b) => b._id.localeCompare(a._id))) },
    findOne: (f) => query(rows.find((r) => match(r, f))),
    findOneAndUpdate: (f, update) => { if (race) race(rows[0]); const row = rows.find((r) => match(r, f)); if (row) { writes++; Object.assign(row, update.$set); row.commercialRevision += update.$inc.commercialRevision } return query(row || null) },
  }
  const deps = { createHash, NextResponse: { json: (body) => ({ status: 200, ...body }) }, canPartyOperationalPermission, getPartyOrderWriteGuard, getInitialPartyAssignmentConfirmationStatus, getPartyRequestContext: async () => ({ context: ctx }), isValidObjectId: (s) => typeof s === 'string' && /^[a-f0-9]{24}$/.test(s), partyError: (status, code, message) => ({ status, code, message }), getPartyOrderModel: async () => Orders, getPartyStaffModel: async () => ({ find: (f) => { calls.push(['staff', f]); return query(staff.filter((s) => match(s, f))) } }), findPartyOrderConflicts: async (args) => { calls.push(['conflicts', args]); return { staffConflicts: conflict ? [{ client: 'secret' }] : [] } }, hasPartyOrderConflicts: (value) => value.staffConflicts.length > 0, getPartySharedLocationOrderIds: async () => [id(55)], recordPartyOrderAudit: async () => { if (failHooks) throw Error('private') }, syncPartyOrderCalendarAfterCrud: async () => { rows[0].updatedAt = 'synced'; if (failHooks) throw Error('private') }, sendPartyPerformerAssignmentPushes: async () => { if (failHooks) return { failed: 1 } } }
  const api = compileFunction(`${source}\nreturn {partyOrderTeamRoute,listPartyOrderTeam,getPartyOrderTeam,updatePartyOrderTeam,getPartyOrderTeamVersion}`, Object.keys(deps))(...Object.values(deps))
  const body = () => ({ expectedVersion: api.getPartyOrderTeamVersion(rows[0]), assignedStaff: [{ staffId: id(8), role: 'assistant' }, { staffId: id(9), role: 'performer' }] })
  return { api, rows, staff, calls, body, write: (data = body()) => api.updatePartyOrderTeam({ context: ctx, orderId: id(1), body: data }), ctx: (v) => { ctx = v }, race: (v) => { race = v }, conflicts: () => { conflict = true }, failHooks: () => { failHooks = true }, writes: () => writes }
}

test('team route capability rejects other tenants, inactive, global role and location owner', async () => {
  const s = setup(); let ran = 0
  const route = s.api.partyOrderTeamRoute(async () => { ran++; return {} })
  for (const c of [context('performer', []), context('location_owner'), { ...context(), staff: { ...context().staff, tenantId: 'b' } }, { ...context(), staff: { ...context().staff, status: 'paused' } }, { ...context('performer', []), user: { role: 'admin' } }]) { s.ctx(c); assert.equal((await route({})).status, 403) }
  assert.equal(ran, 0)
  for (const role of ['owner', 'admin', 'performer']) { s.ctx(context(role)); assert.equal((await route({})).status, 200) }
})
test('team mutation preserves all retained financial/report/calendar state and initializes new staff', async () => {
  const s = setup(), previous = structuredClone(s.rows[0].assignedStaff[0]), result = await s.write()
  assert.deepEqual(s.rows[0].assignedStaff[0], { ...previous, role: 'assistant' })
  assert.equal(s.rows[0].assignedStaff[1].payoutAmount, 0); assert.equal(s.rows[0].assignedStaff[1].confirmationStatus, 'pending')
  assert.equal(s.rows[0].contractAmount, 100); assert.equal(s.rows[0].commercialRevision, 1)
  assert.equal(result.expectedVersion, s.api.getPartyOrderTeamVersion(s.rows[0]))
  for (const key of ['client', 'contractAmount', 'tenantId']) assert.equal(key in result, false)
  assert.equal('payoutAmount' in result.assignedStaff[0], false); assert.equal('report' in result.assignedStaff[0], false)
  assert.equal(result.assignedStaff[0].title, 'Старый'); assert.equal(result.candidates.some((c) => c._id === id(8)), false)
  assert.ok(s.calls.some(([type, args]) => type === 'conflicts' && args.sharedLocationOrderIds[0] === id(55)))
})
test('strict body forbids hidden financial/report injection and duplicate/foreign staff', async () => {
  const s = setup()
  for (const body of [null, [], {}, { ...s.body(), payoutAmount: 100 }, { ...s.body(), assignedStaff: [{ staffId: id(8), role: 'admin', payoutStatus: 'paid' }] }, { ...s.body(), assignedStaff: [{ staffId: id(8), role: 'owner' }] }, { ...s.body(), assignedStaff: [{ staffId: id(9), role: 'performer' }, { staffId: id(9), role: 'assistant' }] }, { ...s.body(), assignedStaff: [...s.body().assignedStaff, { staffId: id(11), role: 'performer' }] }]) await assert.rejects(s.write(body), { status: 400 })
  assert.equal(s.writes(), 0)
})
test('all persisted assignment removals denied even owner and empty work records', async () => {
  const s = setup(); s.ctx(context('owner')); s.rows[0].assignedStaff = [{ staffId: id(8), role: 'performer' }]
  await assert.rejects(s.write({ ...s.body(), assignedStaff: [] }), { code: 'partycrm_assignment_protected', status: 409 }); assert.equal(s.writes(), 0)
})
test('same stored body no-op, closed/foreign/stale rejected and unattached users confirmed', async () => {
  const s = setup(); const current = s.rows[0].assignedStaff.map(({ staffId, role }) => ({ staffId, role }))
  await s.write({ ...s.body(), assignedStaff: current }); assert.equal(s.writes(), 0)
  await s.write({ ...s.body(), assignedStaff: [...current, { staffId: id(10), role: 'assistant' }] }); assert.equal(s.rows[0].assignedStaff[1].confirmationStatus, 'confirmed')
  await assert.rejects(s.api.getPartyOrderTeam({ tenantId: 'b', orderId: id(1) }), { status: 404 })
  await assert.rejects(s.write({ ...s.body(), expectedVersion: '0'.repeat(64) }), { status: 409 })
  for (const status of ['closed', 'canceled']) { s.rows[0].status = status; await assert.rejects(s.write(), { status: 409 }) }
})
test('concurrent confirmation/report/calendar/commercial/status edits reject whole write', async () => {
  for (const mutation of [(r) => { r.assignedStaff[0].confirmationStatus = 'declined' }, (r) => { r.assignedStaff[0].report.text = 'changed' }, (r) => { r.updatedAt = 'later' }, (r) => { r.commercialRevision++ }, (r) => { r.sharedLocationRevision++ }, (r) => { r.status = 'closed' }]) { const s = setup(); s.race(mutation); await assert.rejects(s.write(), { status: 409 }); assert.equal(s.writes(), 0) }
})
test('conflict data sanitized and integration failures keep successful mutation with warnings', async () => {
  const s = setup(); s.conflicts(); await assert.rejects(s.write(), (e) => e.status === 409 && !e.message.includes('secret')); assert.equal(s.writes(), 0)
  const t = setup(); t.failHooks(); const result = await t.write(); assert.equal(result.warnings.length, 3); assert.equal(result.warnings.join(' ').includes('private'), false)
})
test('list uses tenant/open filters and safe cursor pagination', async () => {
  const s = setup(); for (let i = 2; i < 60; i++) s.rows.push({ ...s.rows[0], _id: id(i) }); s.rows.push({ ...s.rows[0], _id: id(60), tenantId: 'b' })
  const first = await s.api.listPartyOrderTeam({ tenantId: 'a' }); assert.equal(first.orders.length, 50); assert.equal(first.nextCursor, id(10)); assert.equal('assignedStaff' in first.orders[0], false)
  const next = await s.api.listPartyOrderTeam({ tenantId: 'a', cursor: first.nextCursor }); assert.equal(next.orders.length, 9)
  await assert.rejects(s.api.listPartyOrderTeam({ tenantId: 'a', cursor: 'invalid' }), { status: 400 })
})
test('actual endpoints await params and reject stale and unauthorized PATCH', async () => {
  const s = setup()
  const routeSource = (await readFile(new URL('../app/api/party/orders/[id]/team/route.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
  const routes = compileFunction(`${routeSource}\nreturn {GET,PATCH}`, ['parseJsonBody', 'getPartyOrderTeam', 'partyOrderTeamRoute', 'updatePartyOrderTeam'])(async (req) => req.json(), s.api.getPartyOrderTeam, s.api.partyOrderTeamRoute, s.api.updatePartyOrderTeam)
  const params = { params: Promise.resolve({ id: id(1) }) }
  assert.equal((await routes.GET({}, params)).data._id, id(1))
  const body = s.body(); assert.equal((await routes.PATCH({ json: async () => body }, params)).status, 200)
  assert.equal((await routes.PATCH({ json: async () => body }, params)).status, 409)
  s.ctx(context('performer', [])); assert.equal((await routes.GET({}, params)).status, 403)
})

test('Mongo query casting preserves raw legacy assignment snapshot in expression', async () => {
  const { default: mongoose } = await import('mongoose')
  const { default: schema } = await import('../schemas/partyOrdersSchema.js')
  const Model = mongoose.models.TeamGuardProbeTest || mongoose.model('TeamGuardProbeTest', new mongoose.Schema(schema))
  const assignment = [{ staffId: new mongoose.Types.ObjectId(), role: 'performer' }]
  const filter = { $and: [{ $expr: { $eq: [{ $ifNull: ['$assignedStaff', null] }, { $literal: assignment }] } }] }
  const cast = Model.findOne(filter).cast()
  assert.deepEqual(cast.$and[0].$expr.$eq[1].$literal, assignment)
  assert.equal('report' in cast.$and[0].$expr.$eq[1].$literal[0], false)
})
