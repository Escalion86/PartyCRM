import test from 'node:test'
import assert from 'node:assert/strict'

import { resolvePartyRequestContext } from './partyApiCore.js'

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
