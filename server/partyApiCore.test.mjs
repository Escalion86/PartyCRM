import test from 'node:test'
import assert from 'node:assert/strict'

import { resolvePartyRequestContext } from './partyApiCore.js'
import { getPartyDefaultRolePermissions } from '../helpers/partyRolePermissions.js'

const companyId = '507f1f77bcf86cd799439011'
const otherCompanyId = '507f1f77bcf86cd799439012'

const buildMembershipContext = (role, overrides = {}) => ({
  sessionUser: { _id: 'user-1', role: 'user' },
  memberships: [
    {
      staffId: 'staff-1',
      tenantId: companyId,
      role,
      status: 'active',
      staff: { _id: 'staff-1', role, status: 'active' },
      company: { _id: companyId, title: 'Компания', status: 'active' },
      ...overrides,
    },
  ],
})

test('resolvePartyRequestContext allows owner and admin management access', () => {
  for (const role of ['owner', 'admin']) {
    const result = resolvePartyRequestContext({
      membershipContext: buildMembershipContext(role),
      requestedCompanyId: companyId,
      managementOnly: true,
    })

    assert.equal(result.error, null)
    assert.equal(result.context.role, role)
    assert.equal(result.context.tenantId, companyId)
  }
})

test('resolvePartyRequestContext rejects performer management access', () => {
  const result = resolvePartyRequestContext({
    membershipContext: buildMembershipContext('performer'),
    requestedCompanyId: companyId,
    managementOnly: true,
  })

  assert.equal(result.error.status, 403)
  assert.equal(result.error.code, 'partycrm_forbidden')
})

test('legacy management endpoints reject a configured administrator with hidden fields or location scope', () => {
  const permissions = getPartyDefaultRolePermissions('admin')
  for (const position of [
    { permissions: { ...permissions, 'finance.payments': 'hidden' }, orderScope: {} },
    { permissions, orderScope: { locationIds: ['location-a'] } },
  ]) {
    const result = resolvePartyRequestContext({ membershipContext: buildMembershipContext('admin', { position }), requestedCompanyId: companyId, managementOnly: true })
    assert.equal(result.error.status, 403)
    assert.equal(result.error.code, 'partycrm_granular_permissions_required')
  }
})

test('a server-marked permission-aware handler still requires an active management membership', () => {
  const position = { permissions: { orders: 'read' }, orderScope: { stageIds: ['preparation'] } }
  const allowed = resolvePartyRequestContext({ membershipContext: buildMembershipContext('admin', { position }), requestedCompanyId: companyId, managementOnly: true, permissionAware: true })
  assert.equal(allowed.error, null)
  for (const role of ['performer', 'location_owner']) {
    const denied = resolvePartyRequestContext({ membershipContext: buildMembershipContext(role, { position }), requestedCompanyId: companyId, managementOnly: true, permissionAware: true })
    assert.equal(denied.error.status, 403)
  }
})

test('full baseline administrator rights remain compatible with legacy management routes', () => {
  const result = resolvePartyRequestContext({ membershipContext: buildMembershipContext('admin', { position: { permissions: getPartyDefaultRolePermissions('admin'), orderScope: {} } }), requestedCompanyId: companyId, managementOnly: true })
  assert.equal(result.error, null)
})

test('resolvePartyRequestContext rejects foreign company id', () => {
  const result = resolvePartyRequestContext({
    membershipContext: buildMembershipContext('owner'),
    requestedCompanyId: otherCompanyId,
  })

  assert.equal(result.error.status, 403)
  assert.equal(result.error.code, 'partycrm_company_access_denied')
  assert.equal(result.context.tenantId, null)
  assert.equal(result.context.staff, null)
  assert.equal(result.context.company, null)
  assert.equal(result.context.role, null)
  assert.equal(result.context.activeMembership, null)
})

test('resolvePartyRequestContext requires selected company header', () => {
  const result = resolvePartyRequestContext({
    membershipContext: buildMembershipContext('owner'),
    requestedCompanyId: '',
  })

  assert.equal(result.error.status, 400)
  assert.equal(result.error.code, 'partycrm_company_id_required')
})

test('resolvePartyRequestContext rejects malformed company id', () => {
  const result = resolvePartyRequestContext({
    membershipContext: buildMembershipContext('owner'),
    requestedCompanyId: 'not-an-object-id',
  })

  assert.equal(result.error.status, 400)
  assert.equal(result.error.code, 'partycrm_invalid_company_id')
})

test('resolvePartyRequestContext rejects inactive selected membership', () => {
  const result = resolvePartyRequestContext({
    membershipContext: buildMembershipContext('owner', {
      status: 'paused',
      staff: { _id: 'staff-1', role: 'owner', status: 'paused' },
    }),
    requestedCompanyId: companyId,
  })

  assert.equal(result.error.status, 403)
  assert.equal(result.error.code, 'partycrm_membership_inactive')
})
