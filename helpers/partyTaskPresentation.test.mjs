import test from 'node:test'
import assert from 'node:assert/strict'
import { getPartyTaskQuickDate, matchesPartyTaskFilter, getPartyTaskDueLabel } from './partyTaskPresentation.js'

test('deadline filters distinguish open overdue, current-day, undated and completed tasks', () => {
  const now = new Date(2026, 9, 27, 14, 30)
  const task = { status: 'new', dueAt: new Date(2026, 9, 27, 10) }
  assert.equal(matchesPartyTaskFilter(task, 'today', now), true)
  assert.equal(matchesPartyTaskFilter(task, 'overdue', now), true)
  assert.equal(matchesPartyTaskFilter({ ...task, status: 'done' }, 'overdue', now), false)
  assert.equal(matchesPartyTaskFilter({ ...task, dueAt: null }, 'undated', now), true)
  assert.equal(matchesPartyTaskFilter({ ...task, dueAt: null }, 'overdue', now), false)
  assert.equal(matchesPartyTaskFilter({ ...task, dueAt: new Date(2026, 9, 28, 0) }, 'today', now), false)
})

test('today shortcut never chooses a morning deadline in the past or spills into tomorrow', () => {
  for (const now of [new Date(2026, 9, 27, 9), new Date(2026, 9, 27, 16, 15), new Date(2026, 9, 27, 23, 45)]) {
    const result = getPartyTaskQuickDate(0, now)
    assert.ok(result > now)
    assert.equal(result.getDate(), 27)
    assert.equal(result.getSeconds(), 0)
  }
  assert.equal(getPartyTaskQuickDate(1, new Date(2026, 9, 27, 20)).getHours(), 10)
})

test('deadline labels omit seconds and do not call a completed task overdue', () => {
  const now = new Date(2026, 9, 27, 14, 30)
  assert.equal(getPartyTaskDueLabel({ status: 'new', dueAt: new Date(2026, 9, 27, 10, 2, 51) }, now), 'Просрочена · Сегодня, 10:02')
  assert.equal(getPartyTaskDueLabel({ status: 'done', dueAt: new Date(2026, 9, 27, 10, 2, 51) }, now), 'Сегодня, 10:02')
})
