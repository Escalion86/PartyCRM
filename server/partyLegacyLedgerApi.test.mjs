import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'

const source = (await readFile(new URL('../app/api/party/orders/[id]/legacy-ledger/route.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const setup = ({ denied = false, failure = null, replayed = false } = {}) => {
  const calls = []
  const service = async (args) => { calls.push(args); if (failure) throw failure; return { status: 'migrated', replayed } }
  const deps = { NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) }, getPartyRequestContext: async ({ managementOnly }) => { assert.equal(managementOnly, true); return denied ? { error: { status: 403 } } : { context: { tenantId: 'trusted', staff: { _id: 'staff' }, user: { _id: 'user' } } } }, isValidObjectId: (id) => /^[a-f0-9]{24}$/.test(id || ''), parseJsonBody: async (req) => req.body, partyError: (status, code, message) => ({ status, body: { code, message } }), getPartyLegacyLedger: service, migratePartyLegacyLedger: service }
  return { calls, api: compileFunction(`${source}\nreturn {GET,POST}`, Object.keys(deps))(...Object.values(deps)) }
}
const params = { params: Promise.resolve({ id: 'a'.repeat(24) }) }
test('preview and migrate enforce owner/admin guard and trusted tenant/actor', async () => {
  const denied = setup({ denied: true }); for (const method of ['GET', 'POST']) assert.equal((await denied.api[method]({}, params)).status, 403); assert.equal(denied.calls.length, 0)
  const s = setup(); await s.api.POST({ body: { expectedFingerprint: 'hash', tenantId: 'foreign', actorStaffId: 'hostile' } }, params)
  assert.deepEqual(s.calls[0], { tenantId: 'trusted', orderId: 'a'.repeat(24), expectedFingerprint: 'hash', actorStaffId: 'staff', actorUserId: 'user' })
})
test('invalid body/id skip service; successful replay uses 200', async () => {
  const s = setup(); assert.equal((await s.api.POST({ body: null }, params)).status, 400); assert.equal((await s.api.GET({}, { params: { id: 'bad' } })).status, 400); assert.equal(s.calls.length, 0)
  assert.equal((await s.api.POST({ body: {} }, params)).status, 201)
  assert.equal((await setup({ replayed: true }).api.POST({ body: {} }, params)).status, 200)
})
test('unexpected migration errors do not reveal database detail', async () => {
  const s = setup({ failure: new Error('secret Mongo URI') }), result = await s.api.GET({}, params)
  assert.equal(result.status, 500); assert.doesNotMatch(JSON.stringify(result), /secret Mongo/)
  assert.equal((await setup({ failure: Object.assign(new Error('Обновите журнал'), { status: 409, code: 'stale' }) }).api.GET({}, params)).status, 409)
})
