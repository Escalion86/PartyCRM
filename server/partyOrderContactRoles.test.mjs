import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import * as roles from './partyOrderContactRoles.js'
import * as brief from './partyOrderBrief.js'
import * as payloadHelpers from './partyOrderPayload.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'

const id = '507f1f77bcf86cd799439011'
const clientId = '507f1f77bcf86cd799439012'
const foreignId = '507f1f77bcf86cd799439013'
const tenantId = '507f1f77bcf86cd799439014'
const q = (value) => ({ lean: async () => structuredClone(value) })
const load = async (path, deps, exports) => {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
    .replace(/^export /gm, '')
  return compileFunction(`${source}\nreturn { ${exports} }`, Object.keys(deps))(...Object.values(deps))
}
const baseBody = { serviceTitle: 'Праздник', status: 'active', contractAmount: 5000 }

test('ordinary order payload cannot forge group membership or shared booking state', async () => {
  const api = await setup({})
  const normalized = api.normalizeOrderPayload({ ...baseBody,
    partyEventGroupId: clientId, sharedLocationBooking: true, sharedLocationRevision: 999,
  })
  for (const key of ['partyEventGroupId', 'sharedLocationBooking', 'sharedLocationRevision']) {
    assert.equal(Object.hasOwn(normalized, key), false)
  }
})
async function setup(currentRoles, currentExtras = {}) {
  let current = { ...baseBody, _id: id, tenantId, contactRoles: currentRoles, ...currentExtras }
  let writes = 0
  const deps = {
    ...roles, ...brief, ...payloadHelpers, getPartyOrderWriteGuard,
    getPartyRequestContext: async () => ({ context: { tenantId, company: {} } }),
    isValidObjectId: (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value),
    parseJsonBody: async (req) => req.body,
    partyError: (status, code) => ({ status, code }),
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    getPartyClientModel: async () => ({ countDocuments(filter) {
      assert.equal(filter.tenantId, tenantId)
      assert.deepEqual(filter.status, { $ne: 'archived' })
      return filter._id.$in.filter((value) => value === clientId).length
    } }),
    getPartyOrderModel: async () => ({
      findOne: () => q(current), countDocuments: async () => 0,
      create: async (doc) => { writes++; current = { ...doc, _id: id }; return current },
      findOneAndUpdate: (filter, update) => {
        assert.equal(filter.tenantId, tenantId)
        writes++; current = { ...current, ...update.$set }; return q(current)
      },
    }),
    getPartyCompanyTariffAccessState: async () => ({ access: {} }),
    canCreatePartyOrderByTariff: () => ({ ok: true }),
    filterPartyOrderPayloadByTariffAccess: (value) => value,
    findPartyOrderConflicts: async () => ({}), hasPartyOrderConflicts: () => false,
    getPartySharedLocationOrderIds: async () => [],
    syncPartyOrderInventory: async () => ({}), recordPartyOrderAudit: async () => {},
    syncPartyOrderCalendarAfterCrud: async () => {}, sendPartyPerformerAssignmentPushes: async () => {},
  }
  const create = await load('../app/api/party/orders/route.js', deps, 'POST, normalizeOrderPayload, validateOrderReferences, applyPartyAssignmentAccountDefaults')
  const update = await load('../app/api/party/orders/[id]/route.js', { ...deps, ...create }, 'PATCH')
  return { ...create, ...update, writes: () => writes }
}

test('contact roles reject malformed IDs, types, oversized text and duplicated/unknown methods', () => {
  for (const value of [null, [], { payerClientId: 'bad' }, { payerClientId: 123 }, { payerClientId: { toHexString: 'invalid' } },
    { representAs: 'x'.repeat(241) }, { communicationNotes: 'x'.repeat(2001) },
    { representAs: null }, { allowedContactMethods: ['phone', 'phone'] },
    { allowedContactMethods: null }, { allowedContactMethods: ['fax'] }, { allowedContactMethods: 'phone' }]) {
    assert.ok(roles.parsePartyOrderContactRoles(value).error, JSON.stringify(value))
  }
})

test('create persists role references and communication notes without changing money', async () => {
  const { POST } = await setup()
  const response = await POST({ body: { ...baseBody, contactRoles: { payerClientId: clientId, onsiteClientId: clientId, representAs: ' Агентство ', allowedContactMethods: ['phone'] } } })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.contactRoles.payerClientId, clientId)
  assert.equal(response.body.data.contactRoles.representAs, 'Агентство')
  assert.equal(response.body.data.contractAmount, 5000)
  assert.deepEqual(response.body.data.transactions, [])
})

for (const method of ['POST', 'PATCH']) test(`${method} rejects cross-tenant role before writing`, async () => {
  const api = await setup()
  const response = await api[method]({ body: { ...baseBody, contactRoles: { partnerClientId: foreignId } } }, { params: { id } })
  assert.equal(response.status, 400)
  assert.equal(response.code, 'partycrm_client_not_found')
  assert.equal(api.writes(), 0)
})

test('legacy PATCH preserves roles and explicit replacement clears omitted roles', async () => {
  const initial = roles.parsePartyOrderContactRoles({ onsiteClientId: clientId, communicationNotes: 'Позвонить' }).value
  const { PATCH } = await setup(initial)
  const preserved = await PATCH({ body: baseBody }, { params: { id } })
  assert.equal(preserved.status, 200)
  assert.deepEqual(preserved.body.data.contactRoles, initial)
  const cleared = await PATCH({ body: { ...baseBody, contactRoles: {} } }, { params: { id } })
  assert.equal(cleared.status, 200)
  assert.deepEqual(cleared.body.data.contactRoles, roles.parsePartyOrderContactRoles().value)
})

test('delete protection counts any contact role in same tenant', async () => {
  const empty = async () => ({ countDocuments: async () => 0 })
  const { getPartyClientDeleteRelations, hasPartyClientDeleteRelations } = await load('./partyClientDeleteCheck.js', {
    getPartyOrderModel: async () => ({ countDocuments: async (filter) => {
      assert.equal(filter.tenantId, tenantId)
      for (const key of roles.PARTY_ORDER_CONTACT_ROLE_KEYS) assert.ok(filter.$or.some((part) => part[`contactRoles.${key}`] === clientId))
      return 1
    } }),
    getPartyTransactionModel: empty, getPartyCallModel: empty,
    getPartyVkConversationModel: empty, getPartyAvitoConversationModel: empty,
  }, 'getPartyClientDeleteRelations, hasPartyClientDeleteRelations')
  assert.equal(hasPartyClientDeleteRelations(await getPartyClientDeleteRelations({ tenantId, clientId })), true)
})

test('merge remaps all roles within tenant before archiving source', async () => {
  const updates = []
  const empty = async () => ({ updateMany: async () => ({ modifiedCount: 0 }) })
  const { mergePartyClients } = await load('./partyClientMerge.js', {
    getPartyClientModel: async () => ({ findOne: (filter) => { assert.equal(filter.tenantId, tenantId); return q({ _id: filter._id }) },
      findOneAndUpdate: () => { assert.equal(updates.length, 5); return q({}) } }),
    getPartyOrderModel: async () => ({ updateMany: async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 } } }),
    getPartyTransactionModel: empty, getPartyCallModel: empty, getPartyVkConversationModel: empty, getPartyVkMessageModel: empty,
    getPartyAvitoConversationModel: empty, getPartyAvitoMessageModel: empty, getPartyTelegramConversationModel: empty, getPartyTelegramMessageModel: empty,
  }, 'mergePartyClients')
  assert.equal((await mergePartyClients({ tenantId, sourceClientId: clientId, targetClientId: id })).ok, true)
  for (const key of roles.PARTY_ORDER_CONTACT_ROLE_KEYS) {
    const item = updates.find(({ filter }) => filter[`contactRoles.${key}`])
    assert.equal(item.filter.tenantId, tenantId)
    assert.equal(item.filter[`contactRoles.${key}`], clientId)
    assert.deepEqual(item.update.$set, { [`contactRoles.${key}`]: id })
  }
})


test('contact-role-only PATCH preserves amount, payments and event details', async () => {
  const transaction = { type: 'income', category: 'deposit', amount: 1500, paymentMethod: 'cash', comment: 'Задаток', date: null, staffId: null }
  const { PATCH } = await setup(undefined, { transactions: [transaction], performerComment: 'Приехать заранее', eventDate: new Date('2026-10-01T10:00:00Z') })
  const result = await PATCH({ body: { contactRoles: { payerClientId: clientId } } }, { params: { id } })
  assert.equal(result.status, 200)
  assert.equal(result.body.data.contractAmount, 5000)
  assert.equal(result.body.data.status, 'active')
  assert.deepEqual(result.body.data.transactions, [transaction])
  assert.equal(result.body.data.performerComment, 'Приехать заранее')
  assert.equal(new Date(result.body.data.eventDate).toISOString(), '2026-10-01T10:00:00.000Z')
})

for (const method of ['POST', 'PATCH']) test(`${method} rejects malformed contact role input before write`, async () => {
  const api = await setup()
  const response = await api[method]({ body: { ...baseBody, contactRoles: { payerClientId: 'invalid' } } }, { params: { id } })
  assert.equal(response.status, 400)
  assert.equal(response.code, 'partycrm_invalid_contact_roles')
  assert.equal(api.writes(), 0)
})
