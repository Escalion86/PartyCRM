import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPartyClientFullName, getPartyClientNameError, resolvePartyClientNameParts } from './partyClientFullName.js'

test('a single name line round-trips in surname-first order with all remaining words', () => {
  const input = '  Иванова-Петрова  Анна  Мария Сергеевна  '
  const parts = resolvePartyClientNameParts(input)
  assert.deepEqual(parts, { firstName: 'Анна', secondName: 'Иванова-Петрова', thirdName: 'Мария Сергеевна' })
  assert.equal(formatPartyClientFullName(parts), 'Иванова-Петрова Анна Мария Сергеевна')
  assert.deepEqual(resolvePartyClientNameParts('Анна'), { firstName: 'Анна', secondName: '', thirdName: '' })
  assert.deepEqual(resolvePartyClientNameParts('Иванова Анна'), { firstName: 'Анна', secondName: 'Иванова', thirdName: '' })
})

test('an unchanged legacy name keeps its original parts, even when the display is ambiguous', () => {
  const original = { firstName: 'Мария Анна', secondName: 'Иванова  де Петрова', thirdName: '' }
  assert.deepEqual(resolvePartyClientNameParts('Иванова де Петрова Мария Анна', original), original)
  const imported = { firstName: 'Петрова Анна Сергеевна', secondName: '', thirdName: '' }
  assert.deepEqual(resolvePartyClientNameParts(formatPartyClientFullName(imported), imported), imported)
  assert.deepEqual(resolvePartyClientNameParts('', imported), { firstName: '', secondName: '', thirdName: '' })
})

test('the form rejects an oversized part without truncating the rest of the name', () => {
  const valid = resolvePartyClientNameParts(`Иванова ${'а'.repeat(120)}`)
  assert.equal(getPartyClientNameError(valid), '')
  const invalid = resolvePartyClientNameParts(`Иванова ${'а'.repeat(121)}`)
  assert.equal(invalid.firstName.length, 121)
  assert.match(getPartyClientNameError(invalid), /120/)
})
