import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPartyDeveloperMemberships } from './partyMembershipCore.js'

test('buildPartyDeveloperMemberships gives developer owner access to non-archived companies', () => {
  const memberships = buildPartyDeveloperMemberships({
    sessionUser: { _id: 'dev-user', role: 'dev' },
    companies: [
      { _id: 'company-b', title: 'Бета', status: 'active' },
      { _id: 'company-paused', title: 'Пауза', status: 'paused' },
      { _id: 'company-a', title: 'Альфа', status: 'active' },
      { _id: 'company-archived', title: 'Архив', status: 'archived' },
    ],
  })

  assert.deepEqual(
    memberships.map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role,
      status: membership.status,
      isOwner: membership.isOwner,
      isAdmin: membership.isAdmin,
      isDeveloperAccess: membership.isDeveloperAccess,
      staffId: membership.staffId,
      staffRole: membership.staff.role,
    })),
    [
      {
        tenantId: 'company-a',
        role: 'owner',
        status: 'active',
        isOwner: true,
        isAdmin: true,
        isDeveloperAccess: true,
        staffId: 'dev:dev-user:company-a',
        staffRole: 'owner',
      },
      {
        tenantId: 'company-b',
        role: 'owner',
        status: 'active',
        isOwner: true,
        isAdmin: true,
        isDeveloperAccess: true,
        staffId: 'dev:dev-user:company-b',
        staffRole: 'owner',
      },
      {
        tenantId: 'company-paused',
        role: 'owner',
        status: 'active',
        isOwner: true,
        isAdmin: true,
        isDeveloperAccess: true,
        staffId: 'dev:dev-user:company-paused',
        staffRole: 'owner',
      },
    ]
  )
})

test('buildPartyDeveloperMemberships does not grant access to regular users', () => {
  const memberships = buildPartyDeveloperMemberships({
    sessionUser: { _id: 'user', role: 'user' },
    companies: [{ _id: 'company-a', title: 'Альфа', status: 'active' }],
  })

  assert.deepEqual(memberships, [])
})
