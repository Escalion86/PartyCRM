import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PARTY_OPERATIONAL_PERMISSIONS,
  canPartyOperationalPermission as can,
  normalizePartyOperationalPermissions as normalize,
} from './partyOperationalPermissions.js'
const context = (
  role = 'performer',
  permissions = ['inventory.movements']
) => ({
  tenantId: 'tenant-a',
  role,
  staff: {
    tenantId: 'tenant-a',
    role,
    status: 'active',
    operationalPermissions: permissions,
  },
})

test('each operational grant authorizes only itself and only an active tenant membership', () => {
  for (const permission of PARTY_OPERATIONAL_PERMISSIONS) {
    const member = context('performer', [permission])
    for (const other of PARTY_OPERATIONAL_PERMISSIONS)
      assert.equal(can(member, other), permission === other)
    member.staff.status = 'paused'
    assert.equal(can(member, permission), false)
    member.staff.status = 'active'
    member.staff.tenantId = 'other'
    assert.equal(can(member, permission), false)
    assert.equal(can(context('admin', []), permission), true)
    assert.equal(can(context('location_owner', [permission]), permission), false)
  }
})
test('capability is explicit for performer and inherited for management', () => {
  for (const role of ['owner', 'admin', 'performer'])
    assert.equal(can(context(role), 'inventory.movements'), true)
  assert.equal(can(context('performer', []), 'inventory.movements'), false)
  assert.equal(can(context('location_owner'), 'inventory.movements'), false)
  assert.equal(can(context('owner'), 'anything'), false)
})
test('foreign, missing and inactive membership cannot grant capability', () => {
  for (const status of ['paused', 'invited', 'archived', undefined]) {
    const c = context('owner')
    c.staff.status = status
    assert.equal(can(c, 'inventory.movements'), false)
  }
  const foreign = context()
  foreign.staff.tenantId = 'other'
  assert.equal(can(foreign, 'inventory.movements'), false)
  const missing = context()
  delete missing.tenantId
  assert.equal(can(missing, 'inventory.movements'), false)
  assert.equal(
    can(
      { role: 'admin', sessionUser: { role: 'admin' } },
      'inventory.movements'
    ),
    false
  )
  const mismatched = context()
  mismatched.role = 'admin'
  assert.equal(can(mismatched, 'inventory.movements'), false)
})
test('normalization filters unknowns and duplicates; grants disappear on revocation', () => {
  assert.deepEqual(
    normalize(['inventory.movements', 'inventory.movements', 'all']),
    ['inventory.movements']
  )
  const c = context()
  assert.equal(can(c, 'inventory.movements'), true)
  c.staff.operationalPermissions = []
  assert.equal(can(c, 'inventory.movements'), false)
})

test('pricing and inventory grants are independent and do not grant administrative rights', () => {
  for (const permission of ['inventory.movements', 'orders.pricing']) {
    const c = context('performer', [permission])
    assert.equal(can(c, permission), true)
    assert.equal(
      can(
        c,
        permission === 'orders.pricing'
          ? 'inventory.movements'
          : 'orders.pricing'
      ),
      false
    )
    for (const forbidden of [
      'orders.assignments',
      'transactions.write',
      'company.settings',
    ])
      assert.equal(can(c, forbidden), false)
    assert.equal(
      can(context('location_owner', [permission]), permission),
      false
    )
    assert.equal(can(context('owner', []), permission), true)
  }
  const c = context('performer', ['orders.pricing', 'inventory.movements'])
  c.staff.operationalPermissions = ['inventory.movements']
  assert.equal(can(c, 'orders.pricing'), false)
  assert.equal(can(c, 'inventory.movements'), true)
})
