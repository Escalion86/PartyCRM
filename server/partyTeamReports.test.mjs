import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as core from './partyReportCore.js'

const author = { role: 'performer', staff: { _id: 'a'.repeat(24) }, tenantId: 't' }
const next = { role: 'performer', staff: { _id: 'b'.repeat(24) }, tenantId: 't' }
const order = { _id: 'o', status: 'active', reportCoordinatorStaffId: author.staff._id, assignedStaff: [{ staffId: author.staff._id }, { staffId: next.staff._id }, { staffId: 'declined', confirmationStatus: 'declined', payoutAmount: 900 }] }
const team = { staffId: author.staff._id, scope: 'team', templateSnapshot: { audience: 'team', fields: [] }, answers: [] }

test('team snapshots contain unique active assignment IDs only', () => {
  assert.deepEqual(core.reportTeamStaffIds({ ...order, assignedStaff: [...order.assignedStaff, order.assignedStaff[0]] }), [author.staff._id, next.staff._id])
  assert.equal(core.isReportCoordinator(author, order), true)
  assert.equal(core.isReportCoordinator(next, order), false)
  assert.equal(core.isReportCoordinator(author, { ...order, assignedStaff: [] }), false)
})

test('coordinator replacement revokes edits but preserves historical author reading', () => {
  const changed = { ...order, reportCoordinatorStaffId: next.staff._id, assignedStaff: [order.assignedStaff[1]] }
  assert.equal(core.canEditPartyReport(author, team, order), true)
  assert.equal(core.canEditPartyReport(author, team, changed), false)
  assert.equal(core.canEditPartyReport(next, team, changed), false)
  assert.equal(core.canReadReportField(author, team, { section: 'finance' }, false), true)
  assert.equal(core.canReadReportField(next, team, { section: 'finance' }, true), false)
  assert.equal(core.canEditPartyReport(next, { ...team, staffId: next.staff._id }, changed), true)
  assert.equal(core.canEditPartyReport(author, team, { ...order, status: 'canceled' }), false)
})

test('audience is immutable within family and missing legacy audience stays individual', () => {
  assert.equal(core.validateReportAudience(undefined), 'individual')
  assert.equal(core.validateReportAudience(undefined, { audience: 'team' }), 'team')
  assert.throws(() => core.validateReportAudience('team', {}), /Тип опубликованной/)
  assert.throws(() => core.validateReportAudience('individual', { audience: 'team' }), /Тип опубликованной/)
  assert.throws(() => core.validateReportAudience('other'), /Некорректный/)
})

const loadRoute = async (path, bindings) => {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  const key = `__teamReportTest${Math.random().toString(36).slice(2)}`
  globalThis[key] = { ...core, ...bindings }
  const names = Object.keys(globalThis[key]).join(',')
  try { return await import(`data:text/javascript;base64,${Buffer.from(`const {${names}}=globalThis.${key};\n${source}`).toString('base64')}`) }
  finally { delete globalThis[key] }
}

test('POST uses template scope, ignores spoofed team snapshot and requires coordinator', async () => {
  let saved
  let context = author
  const template = { _id: 'c'.repeat(24), familyId: 'family', active: true, audience: 'team', stage: 'after', title: 'Team', version: 1, fields: [{ id: 'creative' }] }
  const route = await loadRoute('../app/api/party/reports/route.js', {
    withReportContext: (handler) => (req) => handler(req, context), reportJson: (data) => data, reportId: (id) => id,
    loadReportOrder: async () => order,
    requireReportAuthorAssignment: (ctx, item, staffId, scope) => {
      assert.equal(staffId, ctx.staff._id)
      if (!core.isAssignedReportStaff(ctx, item) || (scope === 'team' && !core.isReportCoordinator(ctx, item))) core.reportFailure('Forbidden', 403)
    },
    latestReportTemplates: async () => [template], reportTemplateApplicability: async (_tenant, _order, templates) => templates,
    getPartyReportModel: async () => ({ create: async (data) => { saved = data; return { toObject: () => data } } }),
    getPartyStaffModel: async () => ({ find: (filter) => { assert.equal(filter.tenantId, 't'); return { select: () => ({ lean: async () => [] }) } } }),
    visibleReport: (_ctx, report) => report,
  })
  const req = { json: async () => ({ orderId: 'o', staffId: context.staff._id, templateId: template._id, scope: 'individual', teamStaffIds: ['injected'] }) }
  await route.POST(req)
  assert.equal(saved.scope, 'team')
  assert.equal(saved.templateSnapshot.audience, 'team')
  assert.deepEqual(saved.teamStaffIds, [author.staff._id, next.staff._id])
  context = next
  saved = null
  await assert.rejects(route.POST(req), { status: 403 })
  assert.equal(saved, null)
})

test('reconciliation route rejects team report before accessing financial data', async () => {
  const route = await loadRoute('../app/api/party/report-reconciliations/route.js', {
    withReportContext: (handler) => (req) => handler(req, author), reportId: (id) => id,
    getPartyReportModel: async () => ({ findOne: (filter) => { assert.equal(filter.tenantId, 't'); return { lean: async () => team } } }),
  })
  await assert.rejects(route.GET({ url: 'http://test?reportId=x' }), { status: 409 })
})

test('financial import rejects team source before settlement creation', async () => {
  const route = await loadRoute('../app/api/party/financial-settlements/import-report/route.js', {
    financialRoute: (handler) => (req) => handler(req, author), parseJsonBody: async () => ({ sourceReportReconciliationId: 'source' }),
    isFinancialId: () => true, financialError: (message, status) => Object.assign(new Error(message), { status }),
    getPartyReportReconciliationModel: async () => ({ findOne: () => ({ lean: async () => ({ reportId: 'team-report', values: [] }) }) }),
    getPartyReportModel: async () => ({ findOne: (filter) => { assert.equal(filter.tenantId, 't'); assert.equal(filter._id, 'team-report'); return { lean: async () => team } } }),
  })
  await assert.rejects(route.POST({}), { status: 409 })
})


test('shared report/media guard enforces current coordinator and revoked assignment', async () => {
  const access = await loadRoute('./partyReportAccess.js', {})
  assert.doesNotThrow(() => access.requireReportAuthorAssignment(author, order, author.staff._id, 'team'))
  assert.throws(() => access.requireReportAuthorAssignment(next, order, next.staff._id, 'team'), { status: 403 })
  assert.throws(() => access.requireReportAuthorAssignment(author, { ...order, reportCoordinatorStaffId: next.staff._id }, author.staff._id, 'team'), { status: 403 })
  assert.throws(() => access.requireReportAuthorAssignment(author, { ...order, assignedStaff: [] }, author.staff._id), { status: 403 })
  assert.throws(() => access.requireReportAuthorAssignment(author, { ...order, status: 'canceled' }, author.staff._id, 'team'), { status: 409 })
})


test('media POST refuses previous coordinator before processing photo bytes', async () => {
  const access = await loadRoute('./partyReportAccess.js', {})
  const route = await loadRoute('../app/api/party/report-media/route.js', {
    withReportContext: (handler) => (req) => handler(req, author),
    reportId: (id) => id,
    loadReportOrder: async () => ({ ...order, reportCoordinatorStaffId: next.staff._id }),
    requireReportAuthorAssignment: access.requireReportAuthorAssignment,
    getPartyReportModel: async () => ({ findOne: (filter) => { assert.equal(filter.tenantId, 't'); return { lean: async () => team } } }),
  })
  const data = new FormData()
  data.set('reportId', 'report')
  data.set('fieldId', 'creative')
  await assert.rejects(route.POST(new Request('http://test', { method: 'POST', body: data })), { status: 403 })
})

test('former team author keeps media policy access, other members cannot see finance', () => {
  const field = { id: 'finance', section: 'finance' }
  assert.equal(core.canReadReportField(author, team, field, false), true)
  assert.equal(core.canReadReportField(next, team, field, true), false)
  assert.equal(core.canReadReportField({ role: 'location_owner', staff: author.staff }, team, field, false), false)
  assert.equal(core.canReadReportField(author, { ...team, scope: undefined, templateSnapshot: { fields: [] } }, field, false), false)
})
