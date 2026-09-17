import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'

const source = (await readFile(new URL('../app/api/party/orders/[id]/related-orders/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const setup = ({ denied = false, failure = null } = {}) => {
  const calls = []
  const service = async (args) => { calls.push(args); if (failure) throw failure; return { groupId: 'group' } }
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyRequestContext: async ({ managementOnly }) => { assert.equal(managementOnly, true); return denied ? { error: { status: 403 } } : { context: { tenantId: 'trusted' } } },
    isValidObjectId: (id) => /^[a-f0-9]{24}$/.test(id || ''),
    parseJsonBody: async (req) => req.body,
    partyError: (status, code, message) => ({ status, body: { code, message } }),
    getPartyRelatedOrders: service, linkPartyRelatedOrder: service, unlinkPartyRelatedOrder: service, updatePartySharedLocationBooking: service,
  }
  return { calls, api: compileFunction(`${source}\nreturn {GET,POST,DELETE,PATCH}`, Object.keys(deps))(...Object.values(deps)) }
}
const params = { params: Promise.resolve({ id: 'a'.repeat(24) }) }
test('all methods enforce management guard before service access', async () => {
  const s = setup({ denied: true })
  for (const method of ['GET', 'POST', 'DELETE', 'PATCH']) assert.equal((await s.api[method]({}, params)).status, 403)
  assert.equal(s.calls.length, 0)
})
test('uses trusted tenant, whitelists mutation inputs and forwards search', async () => {
  const s = setup()
  await s.api.POST({ body: { targetOrderId: 'b'.repeat(24), expectedRevision: 0, title: 'Праздник', tenantId: 'hostile', partyEventGroupId: 'injected' } }, params)
  assert.deepEqual(s.calls[0], { tenantId: 'trusted', orderId: 'a'.repeat(24), targetOrderId: 'b'.repeat(24), expectedRevision: 0, title: 'Праздник' })
  await s.api.GET({ url: 'http://localhost/api?search=abc' }, params)
  assert.equal(s.calls[1].search, 'abc')
  await s.api.DELETE({ body: { expectedRevision: 3, tenantId: 'hostile' } }, params)
  assert.deepEqual(s.calls[2], { tenantId: 'trusted', orderId: 'a'.repeat(24), expectedRevision: 3 })
})
test('invalid IDs and payload never call mutation service', async () => {
  const s = setup()
  assert.equal((await s.api.POST({ body: {} }, params)).status, 400)
  assert.equal((await s.api.DELETE({ body: null }, params)).status, 400)
  assert.equal((await s.api.GET({}, { params: { id: 'invalid' } })).status, 400)
  assert.equal(s.calls.length, 0)
})
test('unknown errors hide internal detail while conflict stays actionable', async () => {
  const unknown = setup({ failure: new Error('secret database information') })
  const response = await unknown.api.GET({ url: 'http://localhost/api' }, params)
  assert.equal(response.status, 500)
  assert.doesNotMatch(JSON.stringify(response), /secret/)
  const conflict = setup({ failure: Object.assign(new Error('Обновите страницу'), { status: 409, code: 'conflict' }) })
  assert.equal((await conflict.api.GET({ url: 'http://localhost/api' }, params)).status, 409)
})

test('PATCH forwards explicit flag and revision with trusted tenant only', async () => {
  const s = setup()
  await s.api.PATCH({ body: { sharedLocationBooking: true, expectedRevision: 5, tenantId: 'hostile', partyEventGroupId: 'injected' } }, params)
  assert.deepEqual(s.calls[0], { tenantId: 'trusted', orderId: 'a'.repeat(24), sharedLocationBooking: true, expectedRevision: 5 })
})
