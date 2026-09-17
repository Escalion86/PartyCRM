import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
const source = (await readFile(new URL('../app/api/party/orders/[id]/group-payments/route.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const setup = ({ denied = false, replayed = false, failSync = false, failure = null } = {}) => {
  const calls = [], hooks = []
  const service = async (args) => { calls.push(args); if (failure) throw failure; return { payment: { _id: 'receipt', allocations: [{ orderId: 'one', amount: 10 }, { orderId: 'two', amount: 15 }] }, replayed } }
  const deps = { NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) }, getPartyRequestContext: async ({ managementOnly }) => { assert.equal(managementOnly, true); return denied ? { error: { status: 403 } } : { context: { tenantId: 'trusted' } } }, isValidObjectId: (id) => /^[a-f\d]{24}$/.test(id), parseJsonBody: async (req) => req.body, partyError: (status, code, message) => ({ status, body: { code, message } }), createPartyGroupPayment: service, listPartyGroupPayments: service, recordPartyOrderAudit: async () => ({}), syncPartyOrderCalendarAfterCrud: async (args) => { hooks.push(args); return { ok: !failSync } } }
  return { calls, hooks, api: compileFunction(`${source}\nreturn {GET,POST}`, Object.keys(deps))(...Object.values(deps)) }
}
const params = { params: { id: 'a'.repeat(24) } }
test('both methods require management before reading data', async () => {
  const s = setup({ denied: true }); for (const method of ['GET', 'POST']) assert.equal((await s.api[method]({}, params)).status, 403)
  assert.equal(s.calls.length, 0)
})
test('trusted tenant only, bad path rejected before service', async () => {
  const s = setup(); await s.api.POST({ body: { tenantId: 'hostile' } }, params)
  assert.equal(s.calls[0].tenantId, 'trusted'); assert.equal(s.calls[0].orderId, 'a'.repeat(24))
  assert.equal((await s.api.GET({}, { params: { id: 'invalid' } })).status, 400)
})
test('sync failures return saved success warning, retry has no duplicate side effects', async () => {
  const s = setup({ failSync: true }), response = await s.api.POST({ body: {} }, params)
  assert.equal(response.status, 201); assert.equal(response.body.success, true); assert.equal(response.body.data.warnings.length, 1); assert.equal(s.hooks.length, 2)
  const retry = setup({ replayed: true }); assert.equal((await retry.api.POST({ body: {} }, params)).status, 200); assert.equal(retry.hooks.length, 0)
})
test('internal errors hidden and business conflicts forwarded', async () => {
  const s = setup({ failure: new Error('secret') }); const result = await s.api.POST({ body: {} }, params)
  assert.equal(result.status, 500); assert.doesNotMatch(JSON.stringify(result), /secret/)
  const conflict = setup({ failure: Object.assign(new Error('Обновите группу'), { status: 409, code: 'conflict' }) })
  assert.equal((await conflict.api.POST({ body: {} }, params)).status, 409)
})
