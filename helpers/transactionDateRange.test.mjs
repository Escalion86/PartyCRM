import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMonthDays,
  calculateDateRangePanelPosition,
  formatDateRangeLabel,
  getNextWeekendRange,
  toDateInputValue,
} from './transactionDateRange.js'

test('formatDateRangeLabel returns idle label for empty range', () => {
  assert.equal(formatDateRangeLabel({ from: '', to: '' }), 'Дата')
})

test('formatDateRangeLabel returns one day without regular spaces', () => {
  assert.equal(
    formatDateRangeLabel({ from: '2026-07-14', to: '2026-07-14' }),
    '14\u00A0июля'
  )
})

test('formatDateRangeLabel returns inclusive range label', () => {
  assert.equal(
    formatDateRangeLabel({ from: '2026-07-14', to: '2026-07-18' }),
    '14\u00A0июля - 18\u00A0июля'
  )
})

test('buildMonthDays starts Monday-first and fills complete weeks', () => {
  assert.deepEqual(buildMonthDays(new Date(2026, 6, 1)).slice(0, 14), [
    null,
    null,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
  ])
  assert.equal(buildMonthDays(new Date(2026, 6, 1)).length, 35)
})

test('getNextWeekendRange returns upcoming Saturday and Sunday', () => {
  assert.deepEqual(getNextWeekendRange(new Date(2026, 5, 16)), {
    from: '2026-06-20',
    to: '2026-06-21',
  })
})

test('toDateInputValue normalizes valid dates and rejects invalid values', () => {
  assert.equal(toDateInputValue(new Date(2026, 5, 20, 18, 30)), '2026-06-20')
  assert.equal(toDateInputValue('not-a-date'), '')
})

test('calculateDateRangePanelPosition clamps fixed panel inside viewport', () => {
  assert.deepEqual(
    calculateDateRangePanelPosition({
      buttonRect: { left: 900, bottom: 48 },
      viewportWidth: 1000,
      panelMaxWidth: 760,
      margin: 12,
      gap: 8,
    }),
    {
      left: 228,
      top: 56,
      width: 760,
    }
  )
})
