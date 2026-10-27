import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./partyRoles.js', import.meta.url), 'utf8')
const workflowSource = await readFile(new URL('../helpers/partyWorkflow.js', import.meta.url), 'utf8')
const workflowUrl = `data:text/javascript;base64,${Buffer.from(workflowSource).toString('base64')}`
const helper = (await readFile(new URL('../helpers/partyRolePermissions.js', import.meta.url), 'utf8')).replace('./partyWorkflow.js', workflowUrl)
const helperUrl = `data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`
let sequence = 0
const tenantId = '507f1f77bcf86cd799439011'
const positionId = '507f1f77bcf86cd799439012'
const staffId = '507f1f77bcf86cd799439013'
const context = (role = 'owner') => ({ tenantId, role, staff: { _id: staffId, tenantId, role, status: 'active' } })
const body = (override = {}) => ({ title: 'Менеджер', description: '', permissions: { orders: 'read' }, orderScope: { stageIds: [], statuses: [], locationIds: [], includeUnlocated: true, assignedOnly: false }, active: true, expectedRevision: 0, ...override })

const load = async (model) => {
  const key = `__partyRoleTest${sequence++}`
  globalThis[key] = model
  let resolved = source.replace("'@helpers/partyRolePermissions'", JSON.stringify(helperUrl))
  resolved = resolved.replace(/^import \{ NextResponse \} from 'next\/server'$/m, 'const NextResponse = { json: (data, options) => ({ data, options }) }')
  resolved = resolved.replace(/^import \{ getPartyRequestContext, isValidObjectId, partyError \} from '\.\/partyApi'$/m, `const isValidObjectId = (value) => /^[a-f\\d]{24}$/i.test(String(value)); const getPartyRequestContext = async () => ({context: globalThis[${JSON.stringify(key)}].requestContext}); const partyError = (status, code, message) => ({ status, code, message })`)
  resolved = resolved.replace(/^import \{ getPartyRoleModel, getPartyStaffModel, getPartyLocationModel \} from '\.\/partyModels'$/m, `const getPartyRoleModel = async () => globalThis[${JSON.stringify(key)}]; const getPartyStaffModel = async () => globalThis[${JSON.stringify(key)}]; const getPartyLocationModel = async () => globalThis[${JSON.stringify(key)}]`)
  resolved = resolved.replace(/^import \{ getPartyAuditActor \} from '\.\/partyAuditLogCore'$/m, 'const getPartyAuditActor = () => ({})')
  resolved = resolved.replace(/^import \{ getPartyAuditLogModel \} from '\.\/partyModels'$/m, `const getPartyAuditLogModel = async () => globalThis[${JSON.stringify(key)}]`)
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)
}

test('foreign or disabled positions cannot be assigned to an employee', async () => {
  let filter
  const { getPartyStaffPositionPatch } = await load({ findOne: (value) => { filter = value; return { lean: async () => null } } })
  await assert.rejects(getPartyStaffPositionPatch({ context: context(), positionId }), (error) => error.code === 'partycrm_invalid_position')
  assert.deepEqual(filter, { _id: positionId, tenantId, active: true })
})

test('an administrator cannot change their own position or assign the owner position', async () => {
  const { getPartyStaffPositionPatch } = await load({ findOne: () => ({ lean: async () => ({ _id: positionId, tenantId, active: true, baseRole: 'performer', permissions: {} }) }) })
  await assert.rejects(getPartyStaffPositionPatch({ context: context('admin'), positionId, targetStaff: { _id: staffId, role: 'admin' } }), (error) => error.code === 'partycrm_self_position_change')
  const ownerPosition = await load({ findOne: () => ({ lean: async () => ({ _id: positionId, tenantId, active: true, baseRole: 'owner', permissions: {} }) }) })
  await assert.rejects(ownerPosition.getPartyStaffPositionPatch({ context: context('admin'), positionId }), (error) => error.code === 'partycrm_only_owner_can_transfer')
})

test('owner authority is not editable through a role payload', async () => {
  const { updatePartyRole } = await load({ findOne: () => ({ lean: async () => ({ _id: positionId, systemKey: 'owner' }) }) })
  await assert.rejects(updatePartyRole(context(), positionId, body()), (error) => error.code === 'partycrm_owner_role_protected')
})

test('concurrent role writes reject a stale revision rather than overwriting newer permissions', async () => {
  let filter
  const { updatePartyRole } = await load({ findOne: () => ({ lean: async () => ({ _id: positionId, tenantId, revision: 3 }) }), findOneAndUpdate: (value) => { filter = value; return { lean: async () => null } } })
  await assert.rejects(updatePartyRole(context(), positionId, body()), (error) => error.code === 'partycrm_role_revision_conflict')
  assert.equal(filter.revision, 0)
  assert.equal(filter.tenantId, tenantId)
})

test('a position in use cannot be disabled without moving its employees', async () => {
  const { updatePartyRole } = await load({ findOne: () => ({ lean: async () => ({ _id: positionId, tenantId, systemKey: null }) }), exists: async () => true })
  await assert.rejects(updatePartyRole(context(), positionId, body({ active: false })), (error) => error.code === 'partycrm_role_in_use')
})

test('unknown permission names are rejected instead of silently receiving a grant', async () => {
  const { createPartyRole } = await load({})
  await assert.rejects(createPartyRole(context(), body({ permissions: { 'unknown.superuser': 'edit' } })), (error) => error.code === 'partycrm_invalid_permissions')
})

test('the role write boundary rejects an administrator without role-management permission', async () => {
  const actor = context('admin')
  actor.position = { _id: 'position', tenantId, active: true, permissions: { 'roles.manage': 'hidden' } }
  const { partyRoleRoute } = await load({ requestContext: actor })
  let called = false
  const response = await partyRoleRoute(async () => { called = true }, { write: true })({})
  assert.equal(response.status, 403)
  assert.equal(called, false)
})

test('role-management permission cannot be used to grant a financial capability the actor lacks', async () => {
  const actor = context('admin')
  actor.position = { _id: 'position', tenantId, active: true, permissions: { 'roles.manage': 'edit', 'finance.payments': 'hidden' } }
  const { createPartyRole } = await load({})
  await assert.rejects(createPartyRole(actor, body({ permissions: { 'finance.payments': 'edit' } })), (error) => error.code === 'partycrm_role_escalation')
})
