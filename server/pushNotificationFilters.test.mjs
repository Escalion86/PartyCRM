import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPushSubscriptionFindFilter } from './pushNotificationFilters.js'

test('buildPushSubscriptionFindFilter keeps tenant-wide behavior without target user', () => {
  assert.deepEqual(
    buildPushSubscriptionFindFilter({
      tenantId: 'company-1',
    }),
    {
      tenantId: 'company-1',
      isActive: true,
    }
  )
})

test('buildPushSubscriptionFindFilter targets one user when targetUserId is provided', () => {
  assert.deepEqual(
    buildPushSubscriptionFindFilter({
      tenantId: 'company-1',
      targetUserId: 'user-1',
    }),
    {
      tenantId: 'company-1',
      isActive: true,
      userId: 'user-1',
    }
  )
})

test('buildPushSubscriptionFindFilter ignores blank target user ids', () => {
  assert.deepEqual(
    buildPushSubscriptionFindFilter({
      tenantId: 'company-1',
      targetUserId: '   ',
    }),
    {
      tenantId: 'company-1',
      isActive: true,
    }
  )
})

test('buildPushSubscriptionFindFilter can target user across PartyCRM tenants', () => {
  assert.deepEqual(
    buildPushSubscriptionFindFilter({
      tenantId: 'company-1',
      product: 'partycrm',
      targetUserId: 'user-1',
      allowCrossTenantUserTarget: true,
    }),
    {
      product: 'partycrm',
      isActive: true,
      userId: 'user-1',
    }
  )
})
