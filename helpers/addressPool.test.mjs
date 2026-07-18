import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAddressPoolPlaceholder,
  normalizePartyPoolAddress,
} from './addressPool.js'

test('empty structured address keeps the explicit empty option visible', () => {
  const emptyAddress = normalizePartyPoolAddress({})

  assert.equal(getAddressPoolPlaceholder(emptyAddress, 'Не выбран'), 'Не выбран')
})

test('filled address is used as the current unsaved address placeholder', () => {
  assert.equal(
    getAddressPoolPlaceholder(
      {
        town: 'Красноярск',
        street: 'Белинского',
        house: '8',
        comment: 'Арена Лазер',
      },
      'Не выбран'
    ),
    'Красноярск, Белинского, д. 8 (Арена Лазер)'
  )
})
