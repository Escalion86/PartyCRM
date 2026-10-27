import test from 'node:test'
import assert from 'node:assert/strict'
import { isPartyTicketingEnabled } from './partyTicketing.js'
import { mergeCompanySettingsPatch, normalizeCompanySettings } from './companySettings.js'
import { canPartyAccess, getPartyDefaultRolePermissions, isPartyRestrictedManagementContext } from './partyRolePermissions.js'

test('ticketing requires an explicit company flag and survives unrelated settings patches', () => {
  for (const value of [undefined, {}, { modules: {} }, { modules: { ticketing: { enabled: 'true' } } }]) assert.equal(isPartyTicketingEnabled(value), false)
  const settings = normalizeCompanySettings({ modules: { ticketing: { enabled: true, secret: 'not-a-setting' } } })
  assert.equal(isPartyTicketingEnabled(settings), true)
  assert.equal(isPartyTicketingEnabled({ settings }), true)
  assert.deepEqual(settings.modules, { ticketing: { enabled: true } })
  assert.equal(isPartyTicketingEnabled(mergeCompanySettingsPatch(settings, { defaultTown: 'Город' })), true)
  assert.equal(isPartyTicketingEnabled(mergeCompanySettingsPatch(settings, { modules: { ticketing: {} } })), true)
  assert.equal(isPartyTicketingEnabled(mergeCompanySettingsPatch(settings, { modules: { ticketing: { enabled: false } } })), false)
})

test('new optional permissions do not change legacy admin eligibility or grant ticket access implicitly', () => {
  const permissions = getPartyDefaultRolePermissions('admin')
  for (const key of Object.keys(permissions)) if (key.startsWith('tickets.') || key === 'tickets' || key === 'orders.fulfillment') delete permissions[key]
  const context = { tenantId: 'company', role: 'admin', staff: { tenantId: 'company', role: 'admin', status: 'active', positionId: 'position' }, position: { active: true, permissions, orderScope: {} } }
  assert.equal(isPartyRestrictedManagementContext(context), false)
  assert.equal(canPartyAccess(context, { resource: 'tickets' }), false)
  context.position.permissions.tickets = 'read'
  assert.equal(canPartyAccess(context, { resource: 'tickets' }), true)
  assert.equal(canPartyAccess(context, { resource: 'tickets.sell', action: 'edit' }), false)
  context.position.permissions['tickets.sell'] = 'edit'
  assert.equal(canPartyAccess(context, { resource: 'tickets.sell', action: 'edit' }), true)
  context.staff.status = 'paused'
  assert.equal(canPartyAccess(context, { resource: 'tickets' }), false)
})
