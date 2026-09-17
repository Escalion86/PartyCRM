import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { buildPartyProposalApplication } from '../helpers/partyProposalApply.js'
import { preservePartyAssignmentConfirmationStatuses } from '../helpers/partyOrderAssignments.js'

const id = '507f1f77bcf86cd799439011'
const serviceId = '507f1f77bcf86cd799439012'
const tenantId = '507f1f77bcf86cd799439013'
const q = (value) => ({ select() { return this }, lean: async () => structuredClone(value) })
const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some((part) => matches(doc, part))
  if (key === '$and') return value.every((part) => matches(doc, part))
  if (value && typeof value === 'object' && '$exists' in value) return Object.hasOwn(doc, key) === value.$exists
  return String(doc[key]) === String(value)
})
const load = async (path, deps, exports) => {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
    .replaceAll('export async function ', 'async function ')
  return compileFunction(`${source}\nreturn { ${exports} }`, Object.keys(deps))(...Object.values(deps))
}
function setup() {
  const current = { _id: id, tenantId, status: 'active', commercialRevision: 0, contractAmount: 1000 }
  const Orders = {
    findOne: () => q(current),
    findOneAndUpdate(filter, update) {
      if (!matches(current, filter)) return q(null)
      Object.assign(current, update.$set)
      current.commercialRevision += update.$inc?.commercialRevision || 0
      return q(current)
    },
  }
  return { current, Orders, deps: {
    getPartyOrderWriteGuard, buildPartyProposalApplication,
    getPartyRequestContext: async () => ({ context: { tenantId, company: {}, staff: { _id: id } } }),
    getPartyCompanyTariffAccessState: async () => ({ access: { allowDocuments: true } }),
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(value),
    parseJsonBody: async (req) => req.body,
    getPartyOrderModel: async () => Orders,
    partyError: (status, code) => ({ status, code }),
    NextResponse: { json: (body) => ({ status: 200, body }) },
    recordPartyOrderAudit: async () => {},
    syncPartyOrderCalendarAfterCrud: async () => {},
    syncPartyOrderInventory: async () => ({}),
  } }
}

for (const status of ['closed', 'canceled']) {
  test(`proposal cannot change order concurrently made ${status}`, async () => {
    const { deps, current } = setup()
    const { POST } = await load('../app/api/party/proposals/[id]/apply-to-order/route.js', {
      ...deps,
      getPartyProposalModel: async () => ({ findOne: () => q({ _id: id, orderId: id, status: 'accepted', total: 2000, items: [{ serviceId, title: 'Шоу', quantity: 1, unitPrice: 2000 }] }) }),
      getPartyServiceModel: async () => ({ find() {
        // Another request completes after the initial order read.
        current.status = status
        return q([{ _id: serviceId, status: 'active' }])
      } }),
    }, 'POST')
    const response = await POST({ body: { expectedCommercialRevision: 0 } }, { params: { id } })
    assert.equal(response.status, 409)
    assert.equal(current.contractAmount, 1000)
  })
}

test('status-only closure cannot use readiness checked before concurrent proposal application', async () => {
  const { deps, current } = setup()
  const { PATCH } = await load('../app/api/party/orders/[id]/route.js', {
    ...deps,
    getPartyTransactionModel: async () => ({ find() {
      current.commercialRevision = 1
      current.contractAmount = 2000
      return q([])
    } }),
    getPartyOrderCloseReadiness: () => ({ ok: true }),
  }, 'PATCH')
  const response = await PATCH({ body: { status: 'closed' } }, { params: { id } })
  assert.equal(response.status, 409)
  assert.equal(current.status, 'active')
})

const assignmentDependencies = (deps) => ({
  ...deps,
  preservePartyAssignmentConfirmationStatuses,
  normalizeOrderPayload: (body) => ({ ...body, assignedStaff: (body.assignedStaff || []).map(({ staffId, role, payoutAmount, payoutStatus, confirmationStatus }) => ({ staffId, role, payoutAmount, payoutStatus, confirmationStatus })) }),
  validateOrderReferences: async () => null,
  applyPartyAssignmentAccountDefaults: async ({ payload }) => payload,
  filterPartyOrderPayloadByTariffAccess: (payload) => payload,
  getPartySharedLocationOrderIds: async () => [],
  findPartyOrderConflicts: async () => ({}),
  hasPartyOrderConflicts: () => false,
  sendPartyPerformerAssignmentPushes: async () => {},
})

test('ordinary partial assignment update preserves payout, report, calendar and unrelated fields', async () => {
  const { deps, current } = setup()
  current.commercialRevision = 3
  current.title = 'Название'
  current.assignedStaff = [{ staffId: serviceId, role: 'performer', payoutAmount: 500, payoutStatus: 'ready', confirmationStatus: 'confirmed', report: { text: 'Отчёт' }, performerGoogleCalendarEventId: 'calendar-id' }]
  const { PATCH } = await load('../app/api/party/orders/[id]/route.js', assignmentDependencies(deps), 'PATCH')
  const response = await PATCH({ body: { commercialRevision: 3, assignedStaff: [{ staffId: serviceId, role: 'assistant' }] } }, { params: { id } })
  assert.equal(response.status, 200)
  assert.equal(current.contractAmount, 1000)
  assert.equal(current.title, 'Название')
  assert.equal(current.assignedStaff[0].payoutAmount, 500)
  assert.equal(current.assignedStaff[0].payoutStatus, 'ready')
  assert.equal(current.assignedStaff[0].confirmationStatus, 'confirmed')
  assert.deepEqual(current.assignedStaff[0].report, { text: 'Отчёт' })
  assert.equal(current.assignedStaff[0].performerGoogleCalendarEventId, 'calendar-id')
  assert.equal(current.commercialRevision, 4)
})

test('ordinary assignment update refuses editor opened before team revision changed', async () => {
  const { deps, current } = setup()
  current.commercialRevision = 2
  current.assignedStaff = [{ staffId: serviceId, role: 'performer' }]
  const { PATCH } = await load('../app/api/party/orders/[id]/route.js', assignmentDependencies(deps), 'PATCH')
  for (const commercialRevision of [0, 1, undefined]) {
    const response = await PATCH({ body: { commercialRevision, assignedStaff: [] } }, { params: { id } })
    assert.equal(response.status, 409)
    assert.equal(current.assignedStaff.length, 1)
  }
})
