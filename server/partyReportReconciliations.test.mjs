import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessReportReconciliation, getReportReconciliationFields, normalizeReconciliationValue, reconciliationStatusFromValues, serializeReportReconciliation, updateReportReconciliation } from './partyReportReconciliations.js'

const author = { role: 'performer', staff: { _id: 'author' } }
const reviewer = { role: 'performer', staff: { _id: 'reviewer' } }
const manager = { role: 'admin', staff: { _id: 'manager' } }
const fields = [
  { fieldId: 'received', label: 'Получено', key: 'received_from_client', valueType: 'money', required: true, reviewerStaffId: 'reviewer' },
  { fieldId: 'method', label: 'Способ', key: 'payment_method', valueType: 'payment_method', required: false, reviewerStaffId: 'other-reviewer' },
]
const fixture = () => ({
  _id: 'reconciliation', staffId: 'author', status: 'draft', revision: 0,
  fields,
  values: [
    { fieldId: 'received', key: 'received_from_client', valueType: 'money', hasValue: false, moneyMinor: null, status: 'draft' },
    { fieldId: 'method', key: 'payment_method', valueType: 'payment_method', hasValue: false, status: 'not_required' },
  ],
  submittedAt: null,
})

test('finance bindings are copied only from explicitly linked finance snapshot fields', () => {
  const report = { templateSnapshot: { fields: [
    { id: 'money', label: 'Сумма', section: 'finance', reconciliationKey: 'amount', reconciliationValueType: 'money', reconciliationRequired: true },
    { id: 'rich-only', label: 'Комментарий', section: 'finance' },
    { id: 'wrong-section', label: 'Творчество', section: 'creative', reconciliationKey: 'hidden', reconciliationValueType: 'money' },
  ] } }
  assert.deepEqual(getReportReconciliationFields(report).map((item) => item.fieldId), ['money'])
})

test('money rejects ambiguous or unsafe notation and accepts zero', () => {
  assert.deepEqual(normalizeReconciliationValue('money', '1234,50'), { hasValue: true, moneyMinor: 123450, dateValue: null, choiceValue: '', textValue: '' })
  assert.equal(normalizeReconciliationValue('money', 0).moneyMinor, 0)
  for (const invalid of ['-1', '1e3', '12.345', '1 000', {}, Infinity]) assert.throws(() => normalizeReconciliationValue('money', invalid), /сумм|числ|знак/i)
})

test('dates, payment methods and text are validated structurally', () => {
  assert.equal(normalizeReconciliationValue('date', '2024-02-29').dateValue.toISOString(), '2024-02-29T00:00:00.000Z')
  assert.throws(() => normalizeReconciliationValue('date', '2023-02-29'), /дат/)
  assert.equal(normalizeReconciliationValue('payment_method', 'cash').choiceValue, 'cash')
  assert.throws(() => normalizeReconciliationValue('payment_method', 'crypto'), /способ/)
  assert.equal(normalizeReconciliationValue('text', '  пояснение  ').textValue, 'пояснение')
})

test('drafts are partial; submission requires structured required fields and future after-report is blocked', () => {
  const reconciliation = fixture()
  let values = updateReportReconciliation({ reconciliation, context: author, action: 'save', values: { received: '' } })
  assert.equal(values[0].status, 'draft')
  assert.throws(() => updateReportReconciliation({ reconciliation, context: author, action: 'submit', eventDate: '2020-01-01', reportStage: 'after' }), /Заполните/)
  values = updateReportReconciliation({ reconciliation, context: author, action: 'save', values: { received: '100.25' } })
  assert.equal(values[0].moneyMinor, 10025)
  assert.throws(() => updateReportReconciliation({ reconciliation: { ...reconciliation, values }, context: author, action: 'submit', eventDate: '2099-01-01', reportStage: 'after', now: new Date('2026-01-01') }), /после начала/)
  values = updateReportReconciliation({ reconciliation: { ...reconciliation, values }, context: author, action: 'submit', eventDate: '2020-01-01', reportStage: 'after' })
  assert.equal(values[0].status, 'submitted')
  assert.equal(values[1].status, 'not_required')
  assert.equal(reconciliationStatusFromValues(values), 'submitted')
})

test('only author edits values; assigned financier or management reviews separately', () => {
  const reconciliation = fixture()
  assert.throws(() => updateReportReconciliation({ reconciliation, context: reviewer, action: 'save', values: { received: 10 } }), /только автор/)
  const submitted = { ...reconciliation, submittedAt: new Date(), values: [{ ...reconciliation.values[0], hasValue: true, moneyMinor: 1000, status: 'submitted' }, reconciliation.values[1]] }
  assert.throws(() => updateReportReconciliation({ reconciliation: submitted, context: { role: 'performer', staff: { _id: 'other' } }, action: 'review', fieldId: 'received', decision: 'accepted' }), /Нет доступа/)
  assert.equal(updateReportReconciliation({ reconciliation: submitted, context: reviewer, action: 'review', fieldId: 'received', decision: 'accepted' })[0].status, 'accepted')
  assert.equal(updateReportReconciliation({ reconciliation: submitted, context: manager, action: 'review', fieldId: 'received', decision: 'accepted' })[0].status, 'accepted')
})

test('submitted and accepted numeric values are frozen until explicit revision request', () => {
  const reconciliation = fixture()
  reconciliation.submittedAt = new Date()
  Object.assign(reconciliation.values[0], { hasValue: true, moneyMinor: 1000, status: 'accepted' })
  assert.throws(() => updateReportReconciliation({ reconciliation, context: author, action: 'save', values: { received: '11.00' } }), /доработку/)
  const returned = updateReportReconciliation({ reconciliation, context: reviewer, action: 'review', fieldId: 'received', decision: 'revision_requested', comment: 'Исправьте сумму' })
  const saved = updateReportReconciliation({ reconciliation: { ...reconciliation, values: returned }, context: author, action: 'save', values: { received: '11.00' } })
  assert.equal(saved[0].moneyMinor, 1100)
})

test('serialization gives a reviewer only assigned values and never rich-text answers', () => {
  const reconciliation = { ...fixture(), reportId: 'report', orderId: 'order', reportTemplateVersion: 2 }
  const report = { staffId: 'author', answers: [{ fieldId: 'received', html: 'secret html' }] }
  const order = { assignedStaff: [{ staffId: 'author' }] }
  const data = serializeReportReconciliation({ reconciliation, report, order, context: reviewer })
  assert.deepEqual(data.fields.map((item) => item.fieldId), ['received'])
  assert.deepEqual(data.values.map((item) => item.fieldId), ['received'])
  assert.equal(JSON.stringify(data).includes('secret html'), false)
})

test('access before draft creation is limited to assigned author, finance reviewer and management', () => {
  const report = { staffId: 'author', templateSnapshot: { fields: [{ id: 'received', label: 'Получено', section: 'finance', reconciliationKey: 'received_from_client', reconciliationValueType: 'money', reviewerStaffId: 'reviewer' }] } }
  const order = { assignedStaff: [{ staffId: 'author' }] }
  assert.equal(canAccessReportReconciliation({ context: author, report, order }), true)
  assert.equal(canAccessReportReconciliation({ context: reviewer, report, order }), true)
  assert.equal(canAccessReportReconciliation({ context: manager, report, order }), true)
  assert.equal(canAccessReportReconciliation({ context: { role: 'performer', staff: { _id: 'other' } }, report, order }), false)
  assert.equal(canAccessReportReconciliation({ context: { role: 'location_owner', staff: { _id: 'reviewer' } }, report, order }), false)
})
