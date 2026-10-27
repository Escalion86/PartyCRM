import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as core from './partyReportCore.js'

const source = (
  await readFile(
    new URL('./partyOrderReportSummaries.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const tenantId = 'company-a',
  orderId = 'order-a',
  authorId = 'author-a'
const makeActor = (staffId, permissions, role = 'performer') => ({
  tenantId,
  role,
  staff: { _id: staffId, tenantId, status: 'active', role },
  position: {
    _id: `position-${staffId}`,
    active: true,
    permissions,
    orderScope: {},
  },
})
const author = makeActor(authorId, {
  orders: 'read',
  reports: 'read',
  'reports.general': 'edit',
  'reports.finance': 'edit',
})
const viewer = makeActor(
  'manager',
  { orders: 'read', reports: 'read', 'reports.general': 'read' },
  'admin'
)
const order = {
  _id: orderId,
  tenantId,
  status: 'active',
  workflowStageId: 'ready',
  assignedStaff: [{ staffId: authorId }],
}
const report = (suffix, generalStatus, financeStatus) => ({
  _id: suffix,
  tenantId,
  orderId,
  staffId: authorId,
  templateSnapshot: {
    fields: [
      { id: 'general', section: 'general' },
      { id: 'finance', section: 'finance' },
    ],
  },
  answers: [
    { fieldId: 'general', status: generalStatus },
    { fieldId: 'finance', status: financeStatus },
  ],
})
const setup = ({
  context = viewer,
  reports = [],
  authors = new Map([[authorId, author]]),
} = {}) => {
  const calls = { reports: [], authors: [], selection: '' }
  const deps = {
    ...core,
    getPartyReportModel: async () => ({
      find: (filter) => {
        calls.reports.push(filter)
        return {
          select(selection) {
            calls.selection = selection
            return this
          },
          lean: async () => reports,
        }
      },
    }),
    loadPartyReportAuthorContexts: async (tenant, staffIds) => {
      calls.authors.push({ tenant, staffIds })
      return authors
    },
  }
  const run = new Function(
    ...Object.keys(deps),
    `${source}\nreturn withPartyOrderReportSummaries`
  )(...Object.values(deps))
  return { calls, run: (orders = [order]) => run({ context, orders }) }
}

test('badges count existing visible report answers, independently of a hidden financial section', async () => {
  const instance = setup({
    reports: [
      report('draft', 'draft', 'accepted'),
      report('submitted', 'submitted', 'revision_requested'),
      report('revision', 'revision_requested', 'accepted'),
      report('accepted', 'accepted', 'draft'),
    ],
  })
  const [result] = await instance.run()
  assert.deepEqual(result.reportSummary, {
    waiting: 1,
    submitted: 1,
    revision: 1,
  })
  assert.equal(instance.calls.reports.length, 1)
  assert.deepEqual(instance.calls.reports[0], {
    tenantId,
    orderId: { $in: [orderId] },
  })
  assert.equal(instance.calls.authors.length, 1)
  assert.doesNotMatch(instance.calls.selection, /html/)
})

test('current author permissions remove obligations without changing stored answers or their snapshot', async () => {
  const financeOnly = makeActor(
    'manager',
    { orders: 'read', reports: 'read', 'reports.finance': 'read' },
    'admin'
  )
  const stored = report('private', 'accepted', 'draft')
  const before = structuredClone(stored)
  const authorWithoutFinance = makeActor(authorId, {
    orders: 'read',
    reports: 'read',
    'reports.general': 'edit',
  })
  const instance = setup({
    context: financeOnly,
    reports: [stored],
    authors: new Map([[authorId, authorWithoutFinance]]),
  })
  assert.deepEqual((await instance.run())[0].reportSummary, {
    waiting: 0,
    submitted: 0,
    revision: 0,
  })
  assert.deepEqual(stored, before)
})

test('no report grant and out-of-scope orders skip queries and remove stale summary fields', async () => {
  for (const context of [
    makeActor('manager', { orders: 'read' }, 'admin'),
    {
      ...viewer,
      position: {
        ...viewer.position,
        orderScope: { stageIds: ['other-stage'] },
      },
    },
  ]) {
    const instance = setup({ context })
    const [result] = await instance.run([
      { ...order, reportSummary: { waiting: 999 } },
    ])
    assert.equal('reportSummary' in result, false)
    assert.equal(instance.calls.reports.length, 0)
  }
})

test('reviewer can count only their permitted questions; cancelled, former authors and other tenants do not count', async () => {
  const reviewer = makeActor('reviewer', {
    orders: 'read',
    reports: 'read',
    'reports.general': 'read',
    'reports.review': 'edit',
  })
  const current = report('visible', 'submitted', 'draft')
  current.templateSnapshot.fields[0].reviewerPositionId = reviewer.position._id
  const outsider = report('other-reviewer', 'revision_requested', 'draft')
  const removed = { ...current, _id: 'removed', staffId: 'no-longer-assigned' }
  const crossTenant = { ...current, _id: 'cross-tenant', tenantId: 'company-b' }
  const instance = setup({
    context: reviewer,
    reports: [current, outsider, removed, crossTenant],
  })
  assert.deepEqual((await instance.run())[0].reportSummary, {
    waiting: 0,
    submitted: 1,
    revision: 0,
  })
  assert.deepEqual(
    (await instance.run([{ ...order, status: 'canceled' }]))[0].reportSummary,
    { waiting: 0, submitted: 0, revision: 0 }
  )
})

test('one batched query covers only authorized input orders, without mixing report counts', async () => {
  const second = { ...order, _id: 'order-b' }
  const inaccessible = {
    ...order,
    _id: 'order-secret',
    workflowStageId: 'hidden',
  }
  const context = {
    ...viewer,
    position: { ...viewer.position, orderScope: { stageIds: ['ready'] } },
  }
  const instance = setup({
    context,
    reports: [
      report('first', 'draft', 'draft'),
      { ...report('second', 'submitted', 'draft'), orderId: second._id },
      {
        ...report('secret', 'revision_requested', 'draft'),
        orderId: inaccessible._id,
      },
    ],
  })
  const result = await instance.run([order, second, inaccessible])
  assert.deepEqual(instance.calls.reports[0].orderId.$in, [orderId, second._id])
  assert.deepEqual(result[0].reportSummary, {
    waiting: 1,
    submitted: 0,
    revision: 0,
  })
  assert.deepEqual(result[1].reportSummary, {
    waiting: 0,
    submitted: 1,
    revision: 0,
  })
  assert.equal('reportSummary' in result[2], false)
})
