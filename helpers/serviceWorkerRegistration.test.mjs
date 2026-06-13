import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  PARTY_SERVICE_WORKER_URL,
  getPartyServiceWorkerRegistrationOptions,
} from './serviceWorkerRegistration.js'

test('production registers the tracked PartyCRM service worker without HTTP cache', () => {
  assert.equal(PARTY_SERVICE_WORKER_URL, '/party-sw.js')
  assert.deepEqual(getPartyServiceWorkerRegistrationOptions(), {
    scope: '/',
    updateViaCache: 'none',
  })
})

test('tracked PartyCRM service worker preserves push resubscription and call actions', async () => {
  const source = await readFile(
    new URL('../public/party-sw.js', import.meta.url),
    'utf8'
  )

  assert.match(source, /getPushApiBase/)
  assert.match(source, /\/api\/party\/push/)
  assert.match(source, /pushsubscriptionchange/)
  assert.match(source, /novofon_recording/)
  assert.match(source, /\/api\/calls\//)
})
