import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSettlementTotals,
  getFinancialPeriodForEvent,
  normalizeFinancialOperation,
  normalizeSettlementAmounts,
} from './partyFinancialSettlements.js'

test('first half uses same-month reconciliation and payment windows', () => {
  const p = getFinancialPeriodForEvent(
    '2026-09-15T16:30:00Z',
    'Asia/Krasnoyarsk'
  )
  assert.equal(p.periodKey, '2026-09-H1')
  assert.equal(p.workEndExclusive.toISOString(), '2026-09-15T17:00:00.000Z')
  assert.equal(p.reconciliationStart.toISOString(), '2026-09-15T17:00:00.000Z')
  assert.equal(p.paymentStart.toISOString(), '2026-09-23T17:00:00.000Z')
  assert.equal(p.paymentEndExclusive.toISOString(), '2026-09-27T17:00:00.000Z')
})
test('second half crosses year and leap-month boundaries correctly', () => {
  const december = getFinancialPeriodForEvent(
    '2026-12-31T12:00:00Z',
    'Asia/Krasnoyarsk'
  )
  assert.equal(december.periodKey, '2026-12-H2')
  assert.equal(
    december.reconciliationStart.toISOString(),
    '2027-01-01T17:00:00.000Z'
  )
  assert.equal(
    december.paymentEndExclusive.toISOString(),
    '2027-01-15T17:00:00.000Z'
  )
  assert.equal(
    getFinancialPeriodForEvent(
      '2028-02-29T10:00:00Z'
    ).workEndExclusive.toISOString(),
    '2028-02-29T17:00:00.000Z'
  )
})
test('already received and paid money reduces balance exactly once', () => {
  const totals = calculateSettlementTotals(
    {
      accrualKopecks: 10000,
      deductionKopecks: 500,
      transportKopecks: 1000,
      otherExpenseKopecks: 300,
    },
    [
      { type: 'received_on_site', amountKopecks: 2000 },
      { type: 'payment', amountKopecks: 4000 },
      { type: 'correction', amountKopecks: -200 },
    ]
  )
  assert.deepEqual(totals, {
    earned: 11100,
    receivedOnSite: 2000,
    paid: 4000,
    correction: -200,
    payable: 8600,
    balance: 4600,
  })
})
test('money validation rejects fractions, negative ordinary amounts and empty correction reason', () => {
  assert.throws(() => normalizeSettlementAmounts({ accrualKopecks: 1.5 }))
  assert.throws(() => normalizeSettlementAmounts({ deductionKopecks: -1 }))
  assert.throws(() =>
    normalizeFinancialOperation({
      type: 'payment',
      amountKopecks: -1,
      idempotencyKey: '1234567890123456',
    })
  )
  assert.throws(() =>
    normalizeFinancialOperation({
      type: 'correction',
      amountKopecks: -1,
      idempotencyKey: '1234567890123456',
    })
  )
})
