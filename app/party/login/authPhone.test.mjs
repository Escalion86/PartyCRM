import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeAuthPhoneForCall } from './authPhone.mjs'

test('adds leading plus for digit-only auth phone from api', () => {
  assert.equal(normalizeAuthPhoneForCall('71234567890'), '+71234567890')
})

test('keeps auth phone unchanged when it already has leading plus', () => {
  assert.equal(normalizeAuthPhoneForCall('+71234567890'), '+71234567890')
})

test('returns empty string for empty auth phone', () => {
  assert.equal(normalizeAuthPhoneForCall(''), '')
})
