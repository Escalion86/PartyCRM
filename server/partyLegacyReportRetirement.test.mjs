import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const source = (
  await readFile(
    new URL('./partyLegacyReportRetirement.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  orderId = 'c'.repeat(24)
const context = {
  tenantId,
  role: 'performer',
  staff: { _id: staffId, tenantId, role: 'performer', status: 'active' },
  position: {
    permissions: { orders: 'read', reports: 'read' },
    orderScope: { stageIds: ['ready'] },
  },
}
const setup = ({
  actor = context,
  order = {
    _id: orderId,
    tenantId,
    status: 'active',
    workflowStageId: 'ready',
  },
  authError = null,
  lookupFailure = false,
} = {}) => {
  const calls = []
  const deps = {
    canPartyAccess,
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(value),
    getPartyRequestContext: async (options) => {
      assert.equal(options.allowLocationOwner, true)
      assert.equal(options.permissionAware, true)
      return { context: actor, error: authError }
    },
    partyError: (status, code, message) => ({ status, code, message }),
    getPartyOrderModel: async () => ({
      findOne: (filter) => {
        if (lookupFailure) throw Error('private database connection details')
        calls.push(filter)
        return {
          select() {
            return this
          },
          lean: async () =>
            order &&
            String(order.tenantId) === String(filter.tenantId) &&
            order._id === filter._id
              ? order
              : null,
        }
      },
      updateOne: () => {
        throw Error('Retired report must never write')
      },
    }),
  }
  const retire = new Function(
    ...Object.keys(deps),
    `${source}\nreturn retirePartyLegacyReport`
  )(...Object.values(deps))
  return {
    calls,
    run: (id = orderId) =>
      retire({}, { params: Promise.resolve({ id, staffId: 'legacy-target' }) }),
  }
}

test('both retired endpoints point to a tenant-checked read-only handler and provide a useful 410', async () => {
  for (const path of [
    '../app/api/party/performer/orders/[id]/report/route.js',
    '../app/api/party/orders/[id]/reports/[staffId]/route.js',
  ]) {
    const route = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(route, /retirePartyLegacyReport as PATCH/)
    assert.doesNotMatch(route, /findOneAndUpdate|\$set|recordPartyOrderAudit/)
  }
  const instance = setup()
  const result = await instance.run()
  assert.equal(result.status, 410)
  assert.equal(result.code, 'partycrm_legacy_report_retired')
  assert.match(result.message, /«Отчёт».*единую форму/)
  assert.deepEqual(instance.calls, [{ _id: orderId, tenantId }])
})

test('retired endpoint returns a safe JSON error if the order lookup fails', async () => {
  const result = await setup({ lookupFailure: true }).run()
  assert.equal(result.status, 500)
  assert.doesNotMatch(JSON.stringify(result), /private database/)
})

test('unauthorized callers and invalid IDs cause no order queries; foreign or hidden orders always return 404', async () => {
  const unauthenticated = setup({ authError: { status: 401 } })
  assert.equal((await unauthenticated.run()).status, 401)
  assert.equal(unauthenticated.calls.length, 0)
  const invalid = setup()
  assert.equal((await invalid.run('invalid')).status, 400)
  assert.equal(invalid.calls.length, 0)
  for (const options of [
    { order: null },
    { order: { _id: orderId, tenantId: 'another-company' } },
    { order: { _id: orderId, tenantId, workflowStageId: 'hidden' } },
    { actor: { ...context, position: { permissions: { orders: 'read' } } } },
  ])
    assert.equal((await setup(options).run()).status, 404)
})
