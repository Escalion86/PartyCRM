import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getPartyAuditActor } from './partyAuditLogCore.js'

const tenantId = 'a'.repeat(24), sourceId = 'b'.repeat(24), targetId = 'c'.repeat(24)
const code = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ').replaceAll('export async function ', 'async function ')
const load = async (path, names, deps) => new Function(...Object.keys(deps), `${await code(path)}\nreturn {${names}}`)(...Object.values(deps))
const query = (value) => ({ lean: async () => value })

test('client deletion is blocked by same-company ticket history without exposing financial details', async () => {
  const empty = async () => ({ countDocuments: async () => 0 })
  const helpers = await load('./partyClientDeleteCheck.js', 'getPartyClientDeleteRelations,hasPartyClientDeleteRelations', { getPartyOrderModel: empty, getPartyTransactionModel: empty, getPartyCallModel: empty, getPartyVkConversationModel: empty, getPartyAvitoConversationModel: empty, getPartyTicketSaleModel: async () => ({ countDocuments: async (filter) => { assert.deepEqual(filter, { tenantId, clientId: sourceId }); return 3 } }) })
  const relations = await helpers.getPartyClientDeleteRelations({ tenantId, clientId: sourceId })
  assert.equal(relations.ticketSales, 3)
  assert.equal(helpers.hasPartyClientDeleteRelations(relations), true)
  assert.doesNotMatch(JSON.stringify(relations), /amount|phone|email/)
})

test('merge relinks ticket clientId after archiving, preserving original contact snapshots', async () => {
  let archived = false
  const empty = async () => ({ updateMany: async () => ({ modifiedCount: 0 }) })
  const deps = { getPartyClientModel: async () => ({ findOne: (filter) => query({ _id: filter._id, firstName: 'Имя' }), findOneAndUpdate: (filter) => { assert.deepEqual(filter, { _id: sourceId, tenantId }); archived = true; return query({ _id: sourceId, status: 'archived' }) } }), getPartyOrderModel: empty, getPartyTransactionModel: empty, getPartyCallModel: empty, getPartyVkConversationModel: empty, getPartyVkMessageModel: empty, getPartyAvitoConversationModel: empty, getPartyAvitoMessageModel: empty, getPartyTelegramConversationModel: empty, getPartyTelegramMessageModel: empty, getPartyTicketSaleModel: async () => ({ updateMany: async (filter, update) => { assert.equal(archived, true); assert.deepEqual(filter, { tenantId, clientId: sourceId }); assert.deepEqual(update, { $set: { clientId: targetId } }); return { modifiedCount: 4 } } }) }
  const { mergePartyClients } = await load('./partyClientMerge.js', 'mergePartyClients', deps)
  const result = await mergePartyClients({ tenantId, sourceClientId: sourceId, targetClientId: targetId })
  assert.equal(result.counts.ticketSales, 4)
})

test('merge API records a tenant-scoped client audit without buyer contact contents', async () => {
  const audits = []
  const { POST } = await load('../app/api/party/clients/[id]/merge/route.js', 'POST', { getPartyRequestContext: async () => ({ context: { tenantId, staff: { _id: sourceId, role: 'owner', firstName: 'Оператор' }, role: 'owner', sessionUser: { _id: targetId } } }), isValidObjectId: (value) => /^[a-f\d]{24}$/.test(value), parseJsonBody: async () => ({ sourceClientId: sourceId }), partyError: (status, code) => ({ status, code }), mergePartyClients: async (input) => { assert.deepEqual(input, { tenantId, sourceClientId: sourceId, targetClientId: targetId }); return { ok: true, targetClient: { firstName: 'Клиент', phone: '79990000000' }, counts: { ticketSales: 4 } } }, getPartyAuditLogModel: async () => ({ create: async (row) => { audits.push(row) } }), getPartyAuditActor, NextResponse: { json: (body) => body } })
  const response = await POST({}, { params: { id: targetId } })
  assert.equal(response.success, true)
  assert.equal(audits[0].tenantId, tenantId)
  assert.equal(audits[0].entityType, 'client')
  assert.equal(audits[0].metadata.counts.ticketSales, 4)
  assert.doesNotMatch(JSON.stringify(audits), /79990000000/)
})
