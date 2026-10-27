import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('../app/api/party/ticketing/providers/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const setup = (changes = {}) => {
  const calls = [], deps = {
    NextResponse: { json: (body, options = {}) => ({ body, ...options, status: options.status || 200 }) },
    getPartyRequestContext: async (options) => { calls.push(options); return { context: { tenantId: 'tenant' } } },
    parseJsonBody: async () => ({ action: 'test', provider: 'evotor', expectedRevision: 1 }),
    partyError: (status, code, message) => ({ status, body: { error: { code, message } } }),
    createPartyTicketProviderService: () => ({ list: async (context) => ({ context, providers: [] }), mutate: async (context, body) => ({ context, action: body.action }) }), ...changes,
  }
  return { calls, ...new Function(...Object.keys(deps), `${source};return {GET,POST,dynamic}`)(...Object.values(deps)) }
}
test('provider endpoints require actual company management context and stop before service on auth failure', async () => {
  const error = { status: 403 }, api = setup({ getPartyRequestContext: async (options) => { assert.equal(options.managementOnly, true); assert.equal(options.permissionAware, undefined); return { error } }, createPartyTicketProviderService: () => { throw new Error('must not load') } })
  assert.equal(await api.GET({}), error); assert.equal(await api.POST({}), error)
})
test('provider route forwards scoped commands, is dynamic, and credentials metadata is never cacheable', async () => {
  const api = setup(), response = await api.GET({}), result = await api.POST({})
  assert.equal(api.dynamic, 'force-dynamic'); assert.equal(response.headers['Cache-Control'], 'no-store'); assert.equal(result.body.data.action, 'test')
  assert.deepEqual(result.body.data.context, { tenantId: 'tenant' }); assert.equal(api.calls[0].managementOnly, true)
})
test('provider route exposes safe actionable domain failure and redacts unexpected database/transport messages', async () => {
  for (const cause of [new Error('PRIVATE_TOKEN DB_CONNECTION'), Object.assign(new Error('Провайдер не принял токен'), { status: 422, code: 'partycrm_provider_unauthorized' })]) {
    const api = setup({ createPartyTicketProviderService: () => ({ list: async () => { throw cause } }) }), response = await api.GET({})
    assert.equal(response.status, cause.status || 500); assert.doesNotMatch(JSON.stringify(response), /PRIVATE|DB_CONNECTION/)
  }
})
