import test from 'node:test'
import assert from 'node:assert/strict'

import { getPartyAuthInfrastructureError } from './partyAuthError.js'

test('DB configuration errors become a safe 503 response', () => {
  assert.deepEqual(
    getPartyAuthInfrastructureError(
      new Error(
        'ArtistCRM and PartyCRM must use different MongoDB databases in a shared runtime.'
      )
    ),
    {
      status: 503,
      code: 'partycrm_db_unavailable',
      message: 'Сервис авторизации временно недоступен',
    }
  )
})

test('unknown auth errors do not expose internal details', () => {
  assert.deepEqual(getPartyAuthInfrastructureError(new Error('secret')), {
    status: 500,
    code: 'partycrm_auth_failed',
    message: 'Не удалось войти',
  })
})
