import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('../app/api/party/ticketing/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const routes = (changes = {}) => {
  const calls = []
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyRequestContext: async () => ({ context: { tenantId: 'company-a' } }),
    parseJsonBody: async () => ({ action: 'sale.create', payload: { quantity: 2 }, requestKey: 'operation_key_123' }),
    partyError: (status, code, message) => ({ status, body: { success: false, error: { code, message } } }),
    createPartyTicketingService: () => ({
      read: async (context, params) => { calls.push({ context, section: params.get('section') }); return { data: [] } },
      mutate: async (context, body) => { calls.push({ context, body }); return { data: { _id: 'sale' }, operation: { id: 'operation', replayed: false } } },
    }),
    ...changes,
  }
  return { calls, ...new Function(...Object.keys(deps), `${source}\nreturn {GET,POST,PATCH}`)(...Object.values(deps)) }
}

test('all ticket endpoints stop before loading models when tenant authentication fails', async () => {
  const error = { status: 403, body: { success: false } }, api = routes({ getPartyRequestContext: async () => ({ error }), createPartyTicketingService: () => { throw new Error('must not execute') } })
  for (const verb of ['GET', 'POST', 'PATCH']) assert.equal(await api[verb]({ url: 'http://test/api/party/ticketing' }), error)
})

test('ticket root route forwards scoped reads and idempotent POST/PATCH commands', async () => {
  const api = routes()
  assert.equal((await api.GET({ url: 'http://test/api/party/ticketing?section=sales' })).status, 200)
  assert.deepEqual(api.calls[0], { context: { tenantId: 'company-a' }, section: 'sales' })
  for (const verb of ['POST', 'PATCH']) {
    const result = await api[verb]({ url: 'http://test/api/party/ticketing' })
    assert.equal(result.body.success, true)
    assert.equal(result.body.operation.id, 'operation')
  }
  assert.equal(api.calls[1].body.requestKey, 'operation_key_123')
})

test('ticket API exposes actionable domain errors while keeping internal failures private', async () => {
  const failure = (error) => routes({ createPartyTicketingService: () => ({ read: async () => { throw error } }) }).GET({ url: 'http://test/api/party/ticketing' })
  const forbidden = await failure(Object.assign(new Error('Нет доступа'), { status: 403, code: 'ticket_forbidden' }))
  assert.equal(forbidden.status, 403)
  assert.equal(forbidden.body.error.code, 'ticket_forbidden')
  const internal = await failure(new Error('private connection details and buyer contacts'))
  assert.equal(internal.status, 500)
  assert.doesNotMatch(JSON.stringify(internal), /private|buyer|connection/)
})
