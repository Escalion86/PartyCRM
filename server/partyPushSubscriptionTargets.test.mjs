import test from 'node:test'
import assert from 'node:assert/strict'

import { getActivePartyPushMembershipTargets } from './partyPushSubscriptionTargets.js'

test('getActivePartyPushMembershipTargets returns active company targets', () => {
  assert.deepEqual(
    getActivePartyPushMembershipTargets([
      { tenantId: 'company-1', status: 'active' },
      { tenantId: 'company-2', status: 'paused' },
      { tenantId: '', status: 'active' },
      { tenantId: 'company-3' },
    ]),
    [{ tenantId: 'company-1' }, { tenantId: 'company-3' }]
  )
})
