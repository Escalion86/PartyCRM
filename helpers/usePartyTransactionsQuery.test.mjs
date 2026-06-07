import test from 'node:test'
import assert from 'node:assert/strict'

import {
  removePartyTransaction,
  upsertPartyTransaction,
} from './partyTransactionsCache.js'

test('upsertPartyTransaction appends new transaction', () => {
  assert.deepEqual(upsertPartyTransaction([], { _id: 'tx-1', amount: 1000 }), [
    { _id: 'tx-1', amount: 1000 },
  ])
})

test('upsertPartyTransaction replaces existing transaction', () => {
  assert.deepEqual(
    upsertPartyTransaction(
      [
        { _id: 'tx-1', amount: 1000 },
        { _id: 'tx-2', amount: 2000 },
      ],
      { _id: 'tx-1', amount: 3000 }
    ),
    [
      { _id: 'tx-1', amount: 3000 },
      { _id: 'tx-2', amount: 2000 },
    ]
  )
})

test('removePartyTransaction removes by id', () => {
  assert.deepEqual(
    removePartyTransaction(
      [
        { _id: 'tx-1', amount: 1000 },
        { _id: 'tx-2', amount: 2000 },
      ],
      'tx-1'
    ),
    [{ _id: 'tx-2', amount: 2000 }]
  )
})
