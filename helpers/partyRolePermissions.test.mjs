import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPartyOrderAccessFilter, canPartyAccess, filterPartyOrderForAccess, getPartyDefaultRolePermissions, guardPartyOrderPatch, isPartyRestrictedManagementContext } from './partyRolePermissions.js'

const member = (overrides = {}) => ({ tenantId: 'company-a', role: 'performer', staff: { _id: 'staff-a', tenantId: 'company-a', status: 'active', role: 'performer', positionId: 'role-a' }, position: { _id: 'role-a', tenantId: 'company-a', active: true, permissions: { orders: 'read', 'orders.title': 'edit', 'orders.client.name': 'read', tasks: 'read', 'tasks.create': 'edit' }, orderScope: { stageIds: ['preparation'], statuses: ['active'], locationIds: ['location-a'], includeUnlocated: false, assignedOnly: false } }, ...overrides })
const order = (overrides = {}) => ({ _id: 'order-a', tenantId: 'company-a', status: 'active', workflowStageId: 'preparation', locationId: 'location-a', title: 'Праздник', client: { name: 'Клиент', phone: 'secret-phone', email: 'secret-email' }, contractAmount: 10000, transactions: [{ amount: 5000, type: 'income' }], leadMeta: { raw: { secret: true } }, assignedStaff: [{ staffId: 'staff-b', payoutAmount: 3000 }], ...overrides })

test('hidden contacts and financial values are absent from order responses, not merely disabled', () => {
  const safe = filterPartyOrderForAccess(member(), order())
  assert.deepEqual(safe.client, { name: 'Клиент' })
  for (const key of ['contractAmount', 'transactions', 'leadMeta', 'assignedStaff']) assert.equal(Object.hasOwn(safe, key), false)
  assert.equal(JSON.stringify(safe).includes('secret'), false)
  assert.equal(safe.title, 'Праздник')
})

test('brief snapshots never reveal hidden service IDs through active or retired conditions', () => {
  const context = member()
  context.position.permissions['orders.eventBrief'] = 'read'
  const snapshot = { revision: 3, fields: [{ id: 'a', label: 'Вопрос', serviceIds: ['hidden-service'] }], retiredFields: [{ id: 'old', label: 'Прежний', serviceIds: ['hidden-service'] }], applicableFieldIds: ['a'], applicabilityFrozen: true }
  const archived = { field: { id: 'archived', label: 'Архивный вопрос', type: 'text', serviceIds: ['hidden-service'] }, value: 'Архивный ответ' }
  const original = order({ servicesIds: ['hidden-service'], eventBrief: { templateSnapshot: snapshot, customAnswers: { a: 'Ответ' }, archivedAnswers: [archived] } })
  const safe = filterPartyOrderForAccess(context, original)
  assert.equal(JSON.stringify(safe).includes('hidden-service'), false)
  assert.deepEqual(safe.eventBrief.templateSnapshot.applicableFieldIds, ['a'])
  assert.equal(safe.eventBrief.customAnswers.a, 'Ответ')
  assert.deepEqual(safe.eventBrief.archivedAnswers[0], { field: { id: 'archived', label: 'Архивный вопрос', type: 'text' }, value: 'Архивный ответ' })
  assert.deepEqual(original.eventBrief.templateSnapshot.fields[0].serviceIds, ['hidden-service'])
  assert.deepEqual(original.eventBrief.archivedAnswers[0].field.serviceIds, ['hidden-service'])
  assert.equal(JSON.stringify(filterPartyOrderForAccess(context, order({ eventBrief: { archivedAnswers: [archived] } }))).includes('hidden-service'), false)
  context.position.permissions['orders.servicesIds'] = 'read'
  assert.deepEqual(filterPartyOrderForAccess(context, original).eventBrief.templateSnapshot.fields[0].serviceIds, ['hidden-service'])
  assert.deepEqual(filterPartyOrderForAccess(context, original).eventBrief.archivedAnswers[0].field.serviceIds, ['hidden-service'])
})

test('all scope conditions apply together and orders from other tenants never pass', () => {
  assert.equal(canPartyAccess(member(), { resource: 'orders', order: order() }), true)
  for (const change of [{ tenantId: 'company-b' }, { status: 'draft' }, { workflowStageId: 'new' }, { locationId: 'location-b' }, { locationId: null }]) assert.equal(filterPartyOrderForAccess(member(), order(change)), null)
})

test('revoked, missing and foreign positions reject access on the next request', () => {
  for (const position of [null, { ...member().position, active: false }, { ...member().position, tenantId: 'company-b' }]) assert.equal(canPartyAccess(member({ position }), { resource: 'orders' }), false)
  const context = member()
  context.staff.status = 'paused'
  assert.equal(canPartyAccess(context, { resource: 'orders' }), false)
})

test('field edit, stage transition and payout permissions cannot be substituted for one another', () => {
  const context = member()
  assert.equal(guardPartyOrderPatch(context, { title: 'Новое название' }, order()).ok, true)
  assert.deepEqual(guardPartyOrderPatch(context, { client: { phone: '79990000000' } }, order()).forbiddenFields, ['client.phone'])
  assert.equal(guardPartyOrderPatch(context, { workflowStageId: 'done' }, order()).ok, false)
  context.position.permissions['orders.assignedStaff'] = 'edit'
  assert.equal(guardPartyOrderPatch(context, { assignedStaff: [{ staffId: 'staff-b', payoutAmount: 9000 }] }, order()).ok, false)
})

test('payout editing can be granted without changing the team or its functions', () => {
  const context = member()
  context.position.permissions['orders.assignedStaff'] = 'read'
  context.position.permissions['finance.payouts'] = 'edit'
  assert.equal(guardPartyOrderPatch(context, { assignedStaff: [{ staffId: 'staff-b', payoutAmount: 4000 }] }, order()).ok, true)
  assert.equal(guardPartyOrderPatch(context, { assignedStaff: [] }, order()).ok, false)
  assert.equal(guardPartyOrderPatch(context, { assignedStaff: [{ staffId: 'staff-b', role: 'assistant', payoutAmount: 4000 }] }, order()).ok, false)
})

test('database scope includes tenant, stage, status and location restrictions before pagination', () => {
  assert.deepEqual(buildPartyOrderAccessFilter(member()), { tenantId: 'company-a', $and: [{ status: { $in: ['active'] } }, { workflowStageId: { $in: ['preparation'] } }, { locationId: { $in: ['location-a'] } }] })
  assert.deepEqual(buildPartyOrderAccessFilter(member({ position: null })), { tenantId: 'company-a', _id: { $in: [] } })
})

test('legacy performers remain limited to assigned orders and new tasks can be created without order access', () => {
  const context = member({ staff: { ...member().staff, positionId: null }, position: null })
  assert.equal(canPartyAccess(context, { resource: 'orders', order: order() }), false)
  assert.equal(canPartyAccess(context, { resource: 'orders', order: order({ assignedStaff: [{ staffId: 'staff-a' }] }) }), true)
  assert.equal(canPartyAccess(context, { resource: 'tasks', action: 'create' }), true)
})

test('system owner retains full data but cannot use an inactive or foreign membership', () => {
  const owner = member({ role: 'owner', staff: { ...member().staff, role: 'owner', positionId: null }, position: null })
  assert.deepEqual(filterPartyOrderForAccess(owner, order()), order())
  assert.equal(filterPartyOrderForAccess(owner, order({ tenantId: 'company-b' })), null)
  owner.staff.status = 'archived'
  assert.equal(canPartyAccess(owner, { resource: 'roles.manage', action: 'edit' }), false)
})

test('client amount can be read without disclosing deposits or payouts', () => {
  const context = member()
  context.position.permissions['finance.clientAmount'] = 'read'
  const safe = filterPartyOrderForAccess(context, order({ clientPayment: { totalAmount: 10000, prepaidAmount: 5000, status: 'prepaid' } }))
  assert.deepEqual(safe.clientPayment, { totalAmount: 10000 })
  assert.equal(safe.contractAmount, 10000)
})

test('an administrative position uses its configured permissions rather than implicit administrator grants', () => {
  const context = member({ role: 'admin', staff: { ...member().staff, role: 'admin' } })
  assert.equal(canPartyAccess(context, { resource: 'finance.payments' }), false)
  assert.equal(canPartyAccess(context, { resource: 'orders.title', action: 'edit', order: order() }), true)
  assert.equal(getPartyDefaultRolePermissions('performer')['roles.manage'], 'hidden')
})

test('team visibility does not expose payouts or permit changing report confirmations', () => {
  const context = member()
  context.position.permissions['orders.assignedStaff'] = 'edit'
  const safe = filterPartyOrderForAccess(context, order())
  assert.equal(safe.assignedStaff[0].staffId, 'staff-b')
  assert.equal(Object.hasOwn(safe.assignedStaff[0], 'payoutAmount'), false)
  assert.equal(guardPartyOrderPatch(context, { assignedStaff: [{ staffId: 'staff-b', confirmationStatus: 'done' }] }, order()).ok, false)
})

test('payout access exposes minimal recipients without opening team functions or confirmations', () => {
  const context = member()
  context.position.permissions['finance.payouts'] = 'edit'
  const safe = filterPartyOrderForAccess(context, order({ assignedStaff: [{ staffId: 'staff-b', role: 'assistant', confirmationStatus: 'declined', payoutAmount: 3000, payoutStatus: 'planned', report: { text: 'private-report' } }] }))
  assert.equal(Object.hasOwn(safe, 'assignedStaff'), false)
  assert.deepEqual(safe.payoutRecipients, [{ staffId: 'staff-b', payoutAmount: 3000, payoutStatus: 'planned' }])
  assert.equal(JSON.stringify(safe).includes('private-report'), false)
})

test('raw embedded task data cannot bypass per-task assignment filtering in the task API', () => {
  const safe = filterPartyOrderForAccess(member(), order({ additionalEvents: [{ title: 'Чужое поручение', responsibleStaffId: 'staff-b' }], taskSummary: { openCount: 0, overdueCount: 0, nearestTask: null } }))
  assert.equal(Object.hasOwn(safe, 'additionalEvents'), false)
  assert.equal(JSON.stringify(safe).includes('Чужое поручение'), false)
  assert.equal(safe.taskSummary.openCount, 0)
})

test('legacy orders without a stage belong to the configured initial stage', () => {
  const context = member()
  context.position.orderScope.stageIds = ['new']
  assert.equal(canPartyAccess(context, { resource: 'orders', order: order({ workflowStageId: undefined }) }), true)
  assert.deepEqual(buildPartyOrderAccessFilter(context).$and[1], { $or: [{ workflowStageId: { $in: ['new'] } }, { workflowStageId: null }, { workflowStageId: '' }] })
})

test('restricted management detection preserves the full baseline and recognizes field or scope restrictions', () => {
  const admin = { role: 'admin', position: { permissions: getPartyDefaultRolePermissions('admin'), orderScope: {} } }
  assert.equal(isPartyRestrictedManagementContext(admin), false)
  assert.equal(isPartyRestrictedManagementContext({ role: 'admin' }), false)
  assert.equal(isPartyRestrictedManagementContext({ ...admin, role: 'owner' }), false)
  admin.position.permissions['finance.payments'] = 'hidden'
  assert.equal(isPartyRestrictedManagementContext(admin), true)
  admin.position.permissions = getPartyDefaultRolePermissions('admin')
  admin.position.orderScope = { locationIds: ['location-a'] }
  assert.equal(isPartyRestrictedManagementContext(admin), true)
})
