import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as core from './partyReportCore.js'
import * as policy from '../helpers/partyReportPolicy.js'

const source = (await readFile(new URL('../app/api/party/reports/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const id = 'a'.repeat(24), tenantId = 'b'.repeat(24), positionId = 'c'.repeat(24)
const queryResult = (rows) => ({ sort() { return this }, limit() { return this }, select() { return this }, lean: async () => rows })

function setup({ templates = [], applicable, status = 'active', assigned = true, reviewer = false, reports = [] } = {}) {
  const context = { tenantId, role: 'performer', staff: { _id: id, tenantId, role: 'performer', status: 'active' }, position: { _id: positionId, active: true, permissions: { reports: 'read', 'reports.general': 'edit', 'reports.review': 'edit' } } }
  const order = { _id: id, status, assignedStaff: assigned ? [{ staffId: id }] : [] }
  const filters = []
  const deps = { ...core, ...policy,
    withReportContext: (handler) => (req) => handler(req, context), reportJson: (data) => data, reportId: (value) => value,
    loadReportOrder: async (tenant) => { assert.equal(tenant, tenantId); return order },
    isAssignedToReportOrder: core.isAssignedReportStaff,
    visibleReport: (ctx, report) => report.templateSnapshot.fields.some((field) => core.canReadReportField(ctx, report, field, assigned)) ? report : null,
    latestReportTemplates: async (tenant) => { assert.equal(tenant, tenantId); return templates },
    reportTemplateApplicability: async (tenant, selectedOrder, active) => { assert.equal(tenant, tenantId); assert.equal(selectedOrder, order); return applicable ?? active },
    filterPartyReportTemplatesForAuthor: (items, ctx, selectedOrder) => items.map((item) => ({ ...item, fields: core.effectivePartyReportFields(ctx, item, selectedOrder) })).filter((item) => item.fields.length),
    loadPartyReportAuthorContexts: async (_tenant, ids) => new Map(ids.map((staffId) => [String(staffId), context])),
    partyReportWithEffectiveStatus: (report, authorContext, selectedOrder) => ({ ...report, status: core.effectivePartyReportStatus(report, authorContext, selectedOrder) }),
    getPartyReportModel: async () => ({ find: (filter) => { filters.push(filter); return queryResult(reports) } }),
    getPartyStaffModel: async () => ({ find: () => queryResult([]) }),
    getPartyOrderModel: async () => ({ find: () => queryResult([order]) }),
  }
  if (reviewer) reports.push({ staffId: 'another', orderId: id, templateSnapshot: { fields: [{ reviewerPositionId: positionId }] }, answers: [] })
  const route = new Function(...Object.keys(deps), `${source}\nreturn { GET };`)(...Object.values(deps))
  return { ...route, filters }
}

test('report API gives actionable absence reasons and does not filter by event start', async () => {
  const request = { url: `http://test/reports?orderId=${id}` }
  assert.equal((await setup().GET(request)).availability.code, 'not_configured')
  assert.equal((await setup({ templates: [{ active: false }] }).GET(request)).availability.code, 'inactive')
  assert.equal((await setup({ templates: [{ active: true }], applicable: [] }).GET(request)).availability.code, 'not_applicable')
  const team = await setup({ templates: [{ active: true, audience: 'team', fields: [{ id: 'question', section: 'general' }] }] }).GET(request)
  assert.equal(team.availability.code, 'coordinator_required')
  const canceled = await setup({ status: 'canceled', templates: [{ active: true }] }).GET(request)
  assert.equal(canceled.canCreateIndividualReport, false)
  assert.equal(canceled.availability.code, 'order_canceled')
})

test('a position reviewer sees only review mode; unassigned outsider is denied before templates are returned', async () => {
  const request = { url: `http://test/reports?orderId=${id}` }
  const result = await setup({ assigned: false, reviewer: true, templates: [{ active: true, title: 'Закрытая форма' }] }).GET(request)
  assert.equal(result.availability.code, 'review_only')
  assert.deepEqual(result.templates, [])
  assert.equal(result.canCreateIndividualReport, false)
  await assert.rejects(setup({ assigned: false }).GET(request), { status: 403 })
})

test('review queue queries staff and effective position inside the current tenant', async () => {
  const route = setup()
  await route.GET({ url: 'http://test/reports' })
  assert.equal(route.filters[0].tenantId, tenantId)
  assert.deepEqual(route.filters[0].$or, [{ 'templateSnapshot.fields.reviewerStaffId': id }, { 'templateSnapshot.fields.reviewerPositionId': positionId }])
})
