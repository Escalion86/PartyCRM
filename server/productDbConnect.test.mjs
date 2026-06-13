import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertProductDbIsolation,
  getProductDbConfig,
} from './productDbConnect.js'

const ENV_KEYS = [
  'MONGODB_URI',
  'MONGODB_DBNAME',
  'PARTYCRM_MONGODB_URI',
  'PARTYCRM_MONGODB_DBNAME',
  'ARTISTCRM_MONGODB_URI',
  'ARTISTCRM_MONGODB_DBNAME',
  'PARTYCRM_SHARED_RUNTIME',
]

const withEnv = (values, callback) => {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  for (const key of ENV_KEYS) delete process.env[key]
  Object.assign(process.env, values)
  try {
    callback()
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

test('PartyCRM prefers dedicated MongoDB variables in a shared runtime', () => {
  withEnv(
    {
      MONGODB_URI: 'mongodb://shared',
      MONGODB_DBNAME: 'shared',
      PARTYCRM_MONGODB_URI: 'mongodb://party',
      PARTYCRM_MONGODB_DBNAME: 'partycrm',
    },
    () => {
      assert.deepEqual(getProductDbConfig('partycrm'), {
        product: 'partycrm',
        uri: 'mongodb://party',
        dbName: 'partycrm',
      })
    }
  )
})

test('product DB config falls back to common variables for standalone deploys', () => {
  withEnv(
    {
      MONGODB_URI: 'mongodb://standalone',
      MONGODB_DBNAME: 'partycrm',
    },
    () => {
      assert.equal(getProductDbConfig('partycrm').uri, 'mongodb://standalone')
      assert.equal(getProductDbConfig('artistcrm').uri, 'mongodb://standalone')
    }
  )
})

test('standalone PartyCRM allows common and PartyCRM variables to resolve to the same database', () => {
  withEnv(
    {
      MONGODB_URI: 'mongodb://shared',
      MONGODB_DBNAME: 'production',
      PARTYCRM_MONGODB_URI: 'mongodb://shared',
      PARTYCRM_MONGODB_DBNAME: 'production',
    },
    () => assert.doesNotThrow(() => assertProductDbIsolation())
  )
})

test('explicit shared runtime rejects identical product databases', () => {
  withEnv(
    {
      ARTISTCRM_MONGODB_URI: 'mongodb://shared',
      ARTISTCRM_MONGODB_DBNAME: 'production',
      PARTYCRM_MONGODB_URI: 'mongodb://shared',
      PARTYCRM_MONGODB_DBNAME: 'production',
    },
    () => {
      assert.throws(
        () => assertProductDbIsolation(),
        /must use different MongoDB databases/
      )
    }
  )
})

test('shared runtime flag compares common ArtistCRM and PartyCRM variables', () => {
  withEnv(
    {
      MONGODB_URI: 'mongodb://shared',
      MONGODB_DBNAME: 'production',
      PARTYCRM_MONGODB_URI: 'mongodb://shared',
      PARTYCRM_MONGODB_DBNAME: 'production',
      PARTYCRM_SHARED_RUNTIME: 'true',
    },
    () => {
      assert.throws(
        () => assertProductDbIsolation(),
        /must use different MongoDB databases/
      )
    }
  )
})

test('shared runtime flag rejects missing PartyCRM database override', () => {
  withEnv(
    {
      MONGODB_URI: 'mongodb://shared',
      MONGODB_DBNAME: 'production',
      PARTYCRM_SHARED_RUNTIME: 'true',
    },
    () => {
      assert.throws(
        () => assertProductDbIsolation(),
        /must use different MongoDB databases/
      )
    }
  )
})

test('shared runtime allows one Mongo server with separate database names', () => {
  withEnv(
    {
      MONGODB_URI: 'mongodb://shared',
      MONGODB_DBNAME: 'artistcrm',
      PARTYCRM_MONGODB_URI: 'mongodb://shared',
      PARTYCRM_MONGODB_DBNAME: 'partycrm',
    },
    () => assert.doesNotThrow(() => assertProductDbIsolation())
  )
})
