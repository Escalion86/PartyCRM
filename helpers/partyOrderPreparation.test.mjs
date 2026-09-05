import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPartyOpenPreparationFilter, getPartyOrderPreparationReadiness, serializePartyOrderPreparation } from './partyOrderPreparation.js'

const staffA = '507f1f77bcf86cd799439011'
const staffB = '507f1f77bcf86cd799439012'

test('disabled preparation preserves legacy close behavior', () => {
  const result = getPartyOrderPreparationReadiness({ assignedStaff: [{ staffId: staffA }] })
  assert.equal(result.enabled, false)
  assert.equal(result.ok, true)
  assert.deepEqual(result.blockers, [])
})

test('enabled preparation reports every operational blocker without exposing text', () => {
  const order = { assignedStaff: [{ staffId: staffA }, { staffId: staffB }], preparation: { enabled: true, items: [{ _id: 'item', title: 'Костюм', status: 'pending', note: 'private' }], clientCheck: { status: 'waiting', note: 'private' }, assembly: { status: 'planned', plannedAt: '2026-09-02T10:00:00Z' }, addressChange: { before: 'Старый адрес', after: 'Новый адрес', acknowledgements: [{ staffId: staffA, acknowledgedAt: '2026-09-02T11:00:00Z' }] } } }
  const result = getPartyOrderPreparationReadiness(order)
  assert.deepEqual(result.blockers.map((item) => item.code), ['preparation_checklist', 'client_check_pending', 'assembly_not_ready', 'address_acknowledgement_pending'])
  assert.equal(result.summary.assignedAcknowledgementCount, 1)
  assert.equal(result.summary.missingAddressAcknowledgementCount, 1)
  const safe = serializePartyOrderPreparation(order, { includeNotes: false })
  assert.equal(safe.items[0].note, '')
  assert.equal(safe.clientCheck.note, '')
})

test('completed checklist, client check, assembly and address acknowledgements are ready', () => {
  const order = { assignedStaff: [{ staffId: staffA }], preparation: { enabled: true, items: [{ status: 'done' }], clientCheck: { status: 'message_received' }, assembly: { status: 'ready' }, addressChange: { before: 'A', after: 'B', acknowledgements: [{ staffId: staffA }] } } }
  assert.equal(getPartyOrderPreparationReadiness(order).ok, true)
})

test('open preparation query is tenant-composable and guards address acknowledgement by changed address', () => {
  const filter = buildPartyOpenPreparationFilter()
  assert.equal(filter['preparation.enabled'], true)
  const source = JSON.stringify(filter)
  assert.match(source, /addressChange\.before/)
  assert.match(source, /addressChange\.after/)
  assert.match(source, /setDifference/)
})
