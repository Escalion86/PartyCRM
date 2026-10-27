import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canPartyAccess,
  getPartyDefaultRolePermissions,
  isPartyRestrictedManagementContext,
} from '../helpers/partyRolePermissions.js'

const source = (
  await readFile(new URL('./partyFinancialApi.js', import.meta.url), 'utf8')
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const actor = (role = 'admin', position = null) => ({
  tenantId: 'company',
  role,
  staff: { _id: 'actor', tenantId: 'company', role, status: 'active' },
  position,
})
const setup = (context) => {
  const calls = []
  const deps = {
    canPartyAccess,
    isPartyRestrictedManagementContext,
    getPartyRequestContext: async (options) => {
      assert.equal(options.allowLocationOwner, true)
      return { context }
    },
    partyError: (status, code) => ({ status, code }),
  }
  const wrap = new Function(
    ...Object.keys(deps),
    `${source}\nreturn financialRoute`
  )(...Object.values(deps))
  return {
    calls,
    get: () =>
      wrap(async () => {
        calls.push('handler')
        return { status: 200 }
      })({ method: 'GET' }),
  }
}

test('legacy global financial views fail closed for restricted managers and location-scoped roles', async () => {
  for (const context of [
    actor('admin', {
      permissions: { 'finance.payouts': 'read' },
      orderScope: {},
    }),
    actor('admin', {
      permissions: getPartyDefaultRolePermissions('admin'),
      orderScope: { locationIds: ['venue'] },
    }),
    actor('location_owner', { permissions: { 'finance.payouts': 'edit' } }),
    actor('performer', {
      permissions: { 'reports.finance': 'edit' },
      orderScope: { stageIds: ['ready'] },
    }),
  ]) {
    const instance = setup(context)
    assert.equal((await instance.get()).status, 403)
    assert.equal(instance.calls.length, 0)
  }
})

test('ordinary management and explicitly granted unscoped personal finance keep working', async () => {
  for (const context of [
    actor('owner'),
    actor('admin'),
    actor('admin', { permissions: getPartyDefaultRolePermissions('admin') }),
    actor('performer', { permissions: { 'reports.finance': 'read' } }),
  ]) {
    assert.equal((await setup(context).get()).status, 200)
  }
  assert.equal(
    (
      await setup(
        actor('performer', { permissions: { 'finance.ownPayout': 'read' } })
      ).get()
    ).status,
    403
  )
})
