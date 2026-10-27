import assert from 'node:assert/strict'
import test from 'node:test'
import { ticketKopecks, ticketMoney, ticketRubles } from './ticketingUi.js'

test('cashier amounts use integer kopecks for Russian decimal input', () => {
  assert.equal(ticketKopecks('1 234,56'), 123456)
  assert.equal(ticketKopecks('700.50'), 70050)
  assert.equal(ticketKopecks('0,01'), 1)
  assert.equal(ticketKopecks('0'), 0)
})

test('cashier never silently rounds, accepts exponents or negative amounts', () => {
  for (const input of [
    '',
    '-1',
    '12.345',
    '1e3',
    'NaN',
    'Infinity',
    '1,2,3',
    '90071992547409910',
  ])
    assert.equal(ticketKopecks(input), null)
  assert.equal(ticketMoney(undefined), '—')
})

test('displayed prices round-trip without losing a kopeck', () => {
  for (const amount of [0, 1, 10, 99, 100, 123456, 999999999999])
    assert.equal(ticketKopecks(ticketRubles(amount)), amount)
})
