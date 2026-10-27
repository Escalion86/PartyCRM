import test from 'node:test'
import assert from 'node:assert/strict'

import { getPartyEntryState, resolvePartyEntryPath } from './partyEntryCore.js'

const employeeMembership = (permissions) => ({
  tenantId: 'company-1', role: 'performer', status: 'active', isAdmin: false,
  staff: { _id: 'staff-1', tenantId: 'company-1', role: 'performer', status: 'active', positionId: 'position-1' },
  position: { _id: 'position-1', tenantId: 'company-1', active: true, permissions },
})

test('a company-only account with a configured employee position enters its working orders', () => {
  const memberships = [employeeMembership({ orders: 'read', tasks: 'read' })]
  assert.equal(resolvePartyEntryPath({ user: { interfaceRoles: ['company'] }, memberships }), '/performer/work')
})

test('a task-only position enters tasks without requiring performer onboarding', () => {
  assert.equal(resolvePartyEntryPath({ user: {}, memberships: [employeeMembership({ tasks: 'read' })] }), '/performer/tasks')
})

test('a restricted administrator enters the filtered editor while the owner retains the company workspace', () => {
  const membership = employeeMembership({ orders: 'read', 'orders.client.name': 'read' })
  membership.role = 'admin'
  membership.isAdmin = true
  membership.staff.role = 'admin'
  membership.position.systemKey = 'admin'
  assert.equal(resolvePartyEntryPath({ user: { interfaceRoles: ['company'] }, memberships: [membership] }), '/performer/work')
  assert.equal(resolvePartyEntryPath({ user: { interfaceRoles: ['company'] }, memberships: [membership, { role: 'owner', isAdmin: true, status: 'active' }] }), '/company')
})

test('paused membership and disabled position cannot bypass onboarding or management access', () => {
  for (const mode of ['paused', 'disabled']) {
    const membership = employeeMembership({ orders: 'edit', tasks: 'edit' })
    if (mode === 'paused') membership.status = 'paused'
    else membership.position.active = false
    assert.equal(resolvePartyEntryPath({ user: { interfaceRoles: ['company'] }, memberships: [membership] }), '/company/master')
  }
})

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
