import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePartyTaskInput, transitionPartyTask, nextPartyTaskOccurrence, isPartyTaskAssignee, getPartyTaskDeadlineWarning } from './partyTasks.js'

const person = '100000000000000000000001'
const position = '200000000000000000000001'
const base = { title: 'Позвонить', assigneeStaffIds: [person], dueAt: '2026-10-31T03:00:00Z' }

test('task validation preserves collective assignment and rejects incomplete recurrence', () => {
  const task = normalizePartyTaskInput({ ...base, assigneeStaffIds: [person, person], assigneeRoleId: position })
  assert.deepEqual(task.assigneeStaffIds, [person])
  assert.equal(task.assigneeRoleId, position)
  assert.throws(() => normalizePartyTaskInput({ ...base, assigneeStaffIds: [] }), /Назначьте/)
  assert.throws(() => normalizePartyTaskInput({ ...base, dueAt: null, recurrence: { frequency: 'daily' } }), /срок/)
  assert.throws(() => normalizePartyTaskInput({ ...base, recurrence: { frequency: 'daily', interval: -1 } }), /Интервал/)
})

test('current position membership controls shared task assignment', () => {
  const task = { assigneeRoleId: position, assigneeStaffIds: [] }
  assert.equal(isPartyTaskAssignee(task, { _id: person, positionId: position }), true)
  assert.equal(isPartyTaskAssignee(task, { _id: person, positionId: 'other' }), false)
})

test('completion records actor once and denied actors cannot cancel or reopen', () => {
  const now = new Date('2026-10-27T12:00:00Z')
  const patch = transitionPartyTask({ task: { status: 'in_progress' }, status: 'done', staffId: person, canComplete: true, now })
  assert.deepEqual(patch, { status: 'done', completedByStaffId: person, completedAt: now })
  assert.equal(transitionPartyTask({ task: { status: 'done' }, status: 'done', staffId: 'other', canComplete: true }), null)
  assert.throws(() => transitionPartyTask({ task: { status: 'new' }, status: 'canceled', canComplete: true }), /отменять/)
  assert.throws(() => transitionPartyTask({ task: { status: 'done' }, status: 'new', canComplete: true }), /завершена/)
})

test('monthly recurrence clamps February but retains original day in March', () => {
  const recurrence = { frequency: 'monthly', interval: 1 }
  const february = nextPartyTaskOccurrence({ after: '2027-01-31T03:00:00Z', recurrence, timeZone: 'Asia/Krasnoyarsk', anchorDay: 31 })
  assert.equal(february, '2027-02-28T03:00:00.000Z')
  assert.equal(nextPartyTaskOccurrence({ after: february, recurrence, timeZone: 'Asia/Krasnoyarsk', anchorDay: 31 }), '2027-03-31T03:00:00.000Z')
})

test('recurrence preserves local wall time over daylight saving and respects end', () => {
  const next = nextPartyTaskOccurrence({ after: '2026-10-24T08:00:00Z', recurrence: { frequency: 'daily' }, timeZone: 'Europe/Berlin' })
  assert.equal(next, '2026-10-25T09:00:00.000Z')
  assert.equal(nextPartyTaskOccurrence({ after: next, recurrence: { frequency: 'weekly', until: '2026-10-26T00:00:00Z' } }), null)
})

test('moving an event only produces a warning and never moves a task deadline', () => {
  const task = normalizePartyTaskInput(base)
  assert.match(getPartyTaskDeadlineWarning(task, { eventDate: '2026-10-30T03:00:00Z' }), /позже/)
  assert.equal(task.dueAt, '2026-10-31T03:00:00.000Z')
})
