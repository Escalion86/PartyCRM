import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { canPartyAccess, filterPartyOrderForAccess } from '../helpers/partyRolePermissions.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { normalizePhoneNumber } from '../helpers/phoneInput.js'

const companyId = '100000000000000000000001'
const orderId = '200000000000000000000001'
const clientId = '300000000000000000000001'
const staffId = '400000000000000000000001'
const positionId = '500000000000000000000001'
const source = (await readFile(new URL('../app/api/party/orders/[id]/client/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
const query = (value) => ({ session() { return this }, lean: async () => value && structuredClone(value) })
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some((part) => match(row, part))
  if (key === '$and') return value.every((part) => match(row, part))
  if (value && typeof value === 'object') {
    if ('$exists' in value) return Object.hasOwn(row, key) === value.$exists
    if ('$ne' in value) return row[key] !== value.$ne
  }
  return String(row[key]) === String(value)
})

function setup(permissions = { orders: 'read', 'orders.client.name': 'edit', 'orders.client.phone': 'edit', 'orders.client.email': 'read' }) {
  const order = { _id: orderId, tenantId: companyId, status: 'active', workflowStageId: 'preparation', clientId, client: { name: 'Анна Иванова', phone: 79000000000, email: 'private@example.com' }, updatedAt: '2026-10-27T05:00:00.000Z', contractAmount: 20000 }
  const client = { _id: clientId, tenantId: companyId, firstName: 'Анна', secondName: 'Иванова', thirdName: 'Петровна', phone: 79000000000, status: 'active' }
  const context = { tenantId: companyId, role: 'performer', staff: { _id: staffId, tenantId: companyId, status: 'active', role: 'performer', positionId }, position: { _id: positionId, tenantId: companyId, active: true, permissions, orderScope: { stageIds: ['preparation'] } } }
  let writes = 0
  let transactions = 0
  const deps = {
    getPartyRequestContext: async () => ({ context }),
    partyError: (status, code) => ({ status, code }),
    isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(id),
    canPartyAccess, filterPartyOrderForAccess, getPartyOrderWriteGuard, normalizePhoneNumber,
    withPartyFinancialTransaction: async (tenant, work) => { assert.equal(tenant, companyId); transactions += 1; return work({}) },
    getPartyOrderModel: async () => ({ findOne: (filter) => query(match(order, filter) ? order : null), findOneAndUpdate: (filter, update, options) => {
      assert.ok(options.session, 'client snapshot and canonical client share one transaction')
      if (!match(order, filter)) return query(null)
      writes += 1
      Object.assign(order, update.$set)
      return query(order)
    } }),
    getPartyClientModel: async () => ({ findOne: (filter) => query(match(client, filter) ? client : null), updateOne: async (filter, update, options) => {
      assert.equal(filter.tenantId, companyId)
      assert.equal(filter._id, clientId)
      assert.ok(options.session)
      writes += 1
      Object.assign(client, update.$set)
    } }),
    recordPartyOrderAudit: async () => {}, syncPartyOrderCalendarAfterCrud: async () => {},
    NextResponse: { json: (body) => ({ status: 200, body }) },
  }
  const PATCH = compileFunction(`${source}\nreturn PATCH`, Object.keys(deps))(...Object.values(deps))
  const request = (patch, expectedUpdatedAt = order.updatedAt) => PATCH({ json: async () => ({ client: patch, expectedUpdatedAt }) }, { params: { id: orderId } })
  return { order, client, context, request, writes: () => writes, transactions: () => transactions }
}

test('a position with phone edit changes the bound contact and snapshot without touching finances', async () => {
  const state = setup()
  const result = await state.request({ phone: '8 (913) 837-00-20' })
  assert.equal(result.status, 200)
  assert.equal(state.client.phone, 79138370020)
  assert.equal(state.order.client.phone, 79138370020)
  assert.equal(state.order.contractAmount, 20000)
  assert.equal(Object.hasOwn(result.body.data, 'contractAmount'), false)
  assert.equal(state.transactions(), 1)
})

test('editing one name part preserves surname and patronymic', async () => {
  const state = setup()
  assert.equal((await state.request({ name: { firstName: 'Мария' } })).status, 200)
  assert.equal(state.client.secondName, 'Иванова')
  assert.equal(state.client.thirdName, 'Петровна')
  assert.equal(state.order.client.name, 'Мария Иванова Петровна')
})

test('read-only or hidden fields cannot be written, even when another field is editable', async () => {
  const state = setup()
  assert.equal((await state.request({ email: 'new@example.com' })).status, 403)
  state.context.position.permissions['orders.client.phone'] = 'hidden'
  assert.equal((await state.request({ phone: '89138370020' })).status, 403)
  assert.equal(state.writes(), 0)
})

test('scope revocation, closed order and stale editor reject before either write', async () => {
  for (const change of ['scope', 'closed', 'stale']) {
    const state = setup()
    if (change === 'scope') state.order.workflowStageId = 'new'
    if (change === 'closed') state.order.status = 'closed'
    const result = await state.request({ phone: '89138370020' }, change === 'stale' ? '2026-10-26T05:00:00.000Z' : state.order.updatedAt)
    assert.equal(result.status, change === 'scope' ? 404 : 409)
    assert.equal(state.writes(), 0)
  }
})

test('invalid telephone and extra contact keys do not mutate canonical data', async () => {
  const state = setup()
  assert.equal((await state.request({ phone: '123' })).status, 400)
  assert.equal((await state.request({ phone: '89138370020', tenantId: 'foreign' })).status, 400)
  assert.equal(state.writes(), 0)
})
