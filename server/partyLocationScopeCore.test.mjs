import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocationScope, buildLocationOrderFilter, parseLocationOrderQuery } from './partyLocationScopeCore.js'
import { resolvePartyRequestContext } from './partyApiCore.js'
import { resolvePartyEntryPath } from './partyEntryCore.js'
import { getActivePartyPushMembershipTargets } from './partyPushSubscriptionTargets.js'

const tenantId = '507f1f77bcf86cd799439011'
const locationId = '507f1f77bcf86cd799439012'
const membership = { tenantId, role: 'location_owner', status: 'active', staff: { locationIds: [locationId] }, company: { _id: tenantId, status: 'active' } }

test('location owners are denied by default and never gain management through opt-in', () => {
  const request = { membershipContext: { sessionUser: { _id: 'user' }, memberships: [membership] }, requestedCompanyId: tenantId }
  assert.equal(resolvePartyRequestContext(request).error.status, 403)
  assert.equal(resolvePartyRequestContext({ ...request, allowLocationOwner: true }).error, null)
  assert.equal(resolvePartyRequestContext({ ...request, allowLocationOwner: true, managementOnly: true }).error.status, 403)
})

test('scope is mandatory and tenant/location restrictions cannot be overwritten', () => {
  for (const value of [undefined, null, [], ['bad'], [locationId, '$ne']]) assert.throws(() => normalizeLocationScope(value))
  const context = { ...membership, tenantId }
  assert.deepEqual(normalizeLocationScope([locationId, locationId]), [locationId])
  const extra = { tenantId: 'foreign', locationId: 'foreign' }
  assert.deepEqual(buildLocationOrderFilter(context, extra), { $and: [{ tenantId, locationId: { $in: [locationId] } }, extra] })
  assert.throws(() => buildLocationOrderFilter({ ...context, role: 'performer' }), { status: 403 })
})

test('query filters validate status and date range including local ISO boundaries', () => {
  for (const query of ['status=oops', 'locationId=bad', 'from=oops', 'from=2026-02-03&to=2026-02-01']) assert.throws(() => parseLocationOrderQuery(new URLSearchParams(query)))
  assert.equal(parseLocationOrderQuery(new URLSearchParams('from=2026-09-02T17:00:00.000Z')).eventDate.$gte.toISOString(), '2026-09-02T17:00:00.000Z')
})

test('scoped entry and notification targets exclude broad workspace', () => {
  assert.equal(resolvePartyEntryPath({ user: { interfaceRoles: ['performer'] }, memberships: [membership] }), '/company/my-locations')
  assert.deepEqual(getActivePartyPushMembershipTargets([membership]), [])
})
