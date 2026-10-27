import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePartyReportPolicy,
  partyReportDueAt,
  partyReportGateBlockers,
  partyReportAvailability,
} from './partyReportPolicy.js'

const order = {
  eventDate: '2026-10-27T10:00:00Z',
  dateEnd: '2026-10-27T12:00:00Z',
  assignedStaff: [
    { staffId: 'alice' },
    { staffId: 'bob' },
    { staffId: 'declined', confirmationStatus: 'declined' },
  ],
}
const template = {
  familyId: 'personal',
  title: 'Личный отчёт',
  audience: 'individual',
  blockCloseUntilAccepted: true,
  blockPayoutUntilAccepted: false,
}

test('deadline accepts signed whole minutes and rejects invalid policies without treating null as zero', () => {
  assert.equal(normalizePartyReportPolicy({}).dueOffsetMinutes, null)
  assert.equal(
    normalizePartyReportPolicy({ dueOffsetMinutes: 0 }).dueOffsetMinutes,
    0
  )
  assert.equal(
    partyReportDueAt(
      { dueAnchor: 'start', dueOffsetMinutes: -120 },
      order
    ).toISOString(),
    '2026-10-27T08:00:00.000Z'
  )
  assert.equal(
    partyReportDueAt(
      { dueAnchor: 'end', dueOffsetMinutes: 1440 },
      order
    ).toISOString(),
    '2026-10-28T12:00:00.000Z'
  )
  assert.equal(partyReportDueAt({ dueOffsetMinutes: null }, order), null)
  assert.equal(partyReportDueAt({ dueOffsetMinutes: 10 }, {}), null)
  for (const value of [
    { dueOffsetMinutes: 'bad' },
    { dueOffsetMinutes: 0.2 },
    { dueOffsetMinutes: Infinity },
    { dueOffsetMinutes: 525601 },
    { dueAnchor: 'tomorrow' },
    { blockPayoutUntilAccepted: 'true' },
  ])
    assert.throws(() => normalizePartyReportPolicy(value))
})

test('closing and payout blockers are independent; payout concerns only the selected author', () => {
  assert.deepEqual(
    partyReportGateBlockers({ order, templates: [template] }).map(
      (row) => row.staffId
    ),
    ['alice', 'bob']
  )
  assert.deepEqual(
    partyReportGateBlockers({
      order,
      templates: [template],
      action: 'payout',
      staffId: 'alice',
    }),
    []
  )
  const payout = {
    ...template,
    blockCloseUntilAccepted: false,
    blockPayoutUntilAccepted: true,
  }
  assert.deepEqual(partyReportGateBlockers({ order, templates: [payout] }), [])
  const reports = [
    {
      staffId: 'alice',
      templateFamilyId: 'personal',
      templateSnapshot: payout,
      status: 'accepted',
    },
  ]
  assert.equal(
    partyReportGateBlockers({
      order,
      templates: [payout],
      reports,
      action: 'payout',
      staffId: 'alice',
    }).length,
    0
  )
  assert.equal(
    partyReportGateBlockers({
      order,
      templates: [payout],
      reports,
      action: 'payout',
      staffId: 'bob',
    }).length,
    1
  )
})

test('a started report keeps its snapshot policy after template changes or deactivation', () => {
  const report = {
    staffId: 'alice',
    templateFamilyId: 'personal',
    templateSnapshot: template,
    status: 'submitted',
  }
  const disabledPolicy = { ...template, blockCloseUntilAccepted: false }
  assert.deepEqual(
    partyReportGateBlockers({
      order,
      templates: [disabledPolicy],
      reports: [report],
    }).map((row) => row.staffId),
    ['alice']
  )
  assert.equal(
    partyReportGateBlockers({ order, templates: [], reports: [report] }).length,
    1
  )
  assert.equal(
    partyReportGateBlockers({
      order,
      templates: [],
      reports: [{ ...report, status: 'accepted' }],
    }).length,
    0
  )
  assert.equal(
    partyReportGateBlockers({
      order,
      templates: [template],
      reports: [{ ...report, templateSnapshot: disabledPolicy }],
    }).filter((row) => row.staffId === 'alice').length,
    0
  )
})

test('team forms never block personal payout and an optional unassigned coordinator creates no blocker', () => {
  const team = { ...template, audience: 'team', blockPayoutUntilAccepted: true }
  assert.equal(partyReportGateBlockers({ order, templates: [team] }).length, 0)
  const coordinated = { ...order, reportCoordinatorStaffId: 'alice' }
  assert.equal(
    partyReportGateBlockers({ order: coordinated, templates: [team] }).length,
    1
  )
  assert.equal(
    partyReportGateBlockers({
      order: coordinated,
      templates: [team],
      action: 'payout',
      staffId: 'alice',
    }).length,
    0
  )
})

test('availability distinguishes configuration, conditions, coordinator and cancellation without returning templates', () => {
  const base = { order: { status: 'active' }, assigned: true }
  assert.equal(partyReportAvailability(base).code, 'not_configured')
  assert.equal(
    partyReportAvailability({ ...base, templates: [template] }).code,
    'inactive'
  )
  assert.equal(
    partyReportAvailability({
      ...base,
      templates: [template],
      activeTemplates: [template],
    }).code,
    'not_applicable'
  )
  assert.equal(
    partyReportAvailability({
      ...base,
      templates: [template],
      activeTemplates: [template],
      applicableTemplates: [{ audience: 'team' }],
    }).code,
    'coordinator_required'
  )
  assert.equal(
    partyReportAvailability({ ...base, order: { status: 'canceled' } }).code,
    'order_canceled'
  )
  const reviewer = partyReportAvailability({
    ...base,
    assigned: false,
    templates: [{ title: 'Секретная форма' }],
  })
  assert.equal(reviewer.code, 'review_only')
  assert.equal(JSON.stringify(reviewer).includes('Секретная'), false)
})
