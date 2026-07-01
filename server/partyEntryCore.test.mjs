import test from 'node:test'
import assert from 'node:assert/strict'

import { getPartyEntryState, resolvePartyEntryPath } from './partyEntryCore.js'

test('getPartyEntryState blocks performer-only users from company workspace', () => {
  const user = {
    _id: 'user-1',
    interfaceRoles: ['performer'],
    performerOnboardingCompletedAt: new Date(),
  }
  const memberships = [
    {
      tenantId: 'company-1',
      role: 'performer',
      isAdmin: false,
      isPerformer: true,
    },
  ]

  const state = getPartyEntryState({ user, memberships })

  assert.equal(state.canUseCompany, false)
  assert.equal(state.companyReady, false)
  assert.equal(state.canUsePerformer, true)
  assert.equal(resolvePartyEntryPath({ user, memberships }), '/performer')
})

test('getPartyEntryState allows company workspace for company owner membership', () => {
  const user = { _id: 'user-1', interfaceRoles: ['company'], role: 'user' }
  const memberships = [
    {
      tenantId: 'company-1',
      role: 'owner',
      isAdmin: true,
      isOwner: true,
    },
  ]

  const state = getPartyEntryState({ user, memberships })

  assert.equal(state.canUseCompany, true)
  assert.equal(state.companyReady, true)
  assert.equal(resolvePartyEntryPath({ user, memberships }), '/company')
})

test('getPartyEntryState lets developer use company workspace through management memberships', () => {
  const user = { _id: 'dev-user', role: 'dev', interfaceRoles: [] }
  const memberships = [{ role: 'owner', isAdmin: true }]

  const state = getPartyEntryState({ user, memberships })

  assert.equal(state.canUseCompany, true)
  assert.equal(state.companyReady, true)
  assert.equal(state.needsRoleSelection, false)
  assert.equal(resolvePartyEntryPath({ user, memberships }), '/company')
})
