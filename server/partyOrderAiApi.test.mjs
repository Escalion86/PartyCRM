import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PARTY_AI_FIELDS } from '../helpers/partyOrderAi.mjs'
import { preparePartyOrderAi } from './partyOrderAi.js'

const routeSource = await readFile(
  new URL('../app/api/party/orders/ai-assist/route.js', import.meta.url),
  'utf8'
)
const imports = routeSource.replace(/^import[\s\S]*? from ['"][^'"]+['"]\r?\n/gm, '')
const prelude = `
const NextResponse = { json: (value, options) => Response.json(value, options) };
const partyError = (status, code, message) => Response.json({success:false,error:{code,message}}, {status});
const getPartyRequestContext = async (options) => { if(!options.managementOnly) throw new Error('management guard missing'); return globalThis.__partyAiTest.context; };
const getPartyCompanyTariffAccessState = async () => globalThis.__partyAiTest.tariff;
const isValidObjectId = value => /^[a-f0-9]{24}$/.test(value);
const getPartyOrderModel = async () => ({findOne: filter => { globalThis.__partyAiTest.filters.push(filter); return {select: () => ({lean: async () => globalThis.__partyAiTest.order})} }});
const model = async () => ({find: filter => {globalThis.__partyAiTest.filters.push(filter); return {select: () => ({limit: () => ({lean: async () => []})})} }});
const getPartyClientModel = model, getPartyLocationModel = model, getPartyServiceModel = model;
const preparePartyOrderAi = async () => {globalThis.__partyAiTest.calls++; return {patch:{title:'Праздник'},notes:[]}};
const transcribeAudioBlob = async () => 'Распознанный текст';
const PARTY_AI_FIELDS = ${JSON.stringify(PARTY_AI_FIELDS)};
`
const { POST } = await import(
  `data:text/javascript;base64,${Buffer.from(prelude + imports).toString('base64')}`
)
const setup = () => {
  globalThis.__partyAiTest = {
    context: { context: { tenantId: 'company-a' } },
    tariff: {
      company: { settings: { integrations: { aitunnelKey: 'test-key' } } },
      access: { allowAi: true },
    },
    order: null,
    filters: [],
    calls: 0,
  }
  return globalThis.__partyAiTest
}
const request = (body) =>
  new Request('http://localhost/api/party/orders/ai-assist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

test('AI route refuses unauthenticated and unauthorized requests before provider access', async () => {
  for (const status of [401, 403]) {
    const state = setup()
    state.context = { error: Response.json({}, { status }) }
    assert.equal((await POST(request({ text: 'Заказ' }))).status, status)
    assert.equal(state.calls, 0)
  }
})
test('AI checks tariff, integration and foreign order ownership', async () => {
  let state = setup()
  state.tariff.access.allowAi = false
  assert.equal((await POST(request({ text: 'Заказ' }))).status, 403)
  state = setup()
  state.tariff.company.settings.integrations = {}
  assert.equal((await POST(request({ text: 'Заказ' }))).status, 409)
  state = setup()
  assert.equal(
    (
      await POST(
        request({
          text: 'Изменить',
          orderId: 'a'.repeat(24),
          tenantId: 'company-b',
        })
      )
    ).status,
    404
  )
  assert.deepEqual(state.filters, [
    { _id: 'a'.repeat(24), tenantId: 'company-a' },
  ])
  assert.equal(state.calls, 0)
})
test('AI rejects closed order and invalid input, scopes every catalog read', async () => {
  let state = setup()
  state.order = { status: 'closed' }
  assert.equal(
    (await POST(request({ text: 'Изменить', orderId: 'a'.repeat(24) }))).status,
    409
  )
  setup()
  assert.equal((await POST(request({ text: 'x'.repeat(12001) }))).status, 400)
  state = setup()
  const response = await POST(
    request({ text: 'Праздник', tenantId: 'company-b' })
  )
  assert.equal(response.status, 200)
  assert.equal(state.calls, 1)
  assert.equal(state.filters.length, 3)
  assert.ok(state.filters.every((filter) => filter.tenantId === 'company-a'))
  assert.ok(!JSON.stringify(await response.json()).includes('test-key'))
})

test('AI refuses unsupported configured provider and invalid audio without analysis', async () => {
  let state = setup()
  state.tariff.company.settings.integrations.aiAnalysisProvider = 'other'
  assert.equal((await POST(request({ text: 'Заказ' }))).status, 409)
  assert.equal(state.calls, 0)
  state = setup()
  const form = new FormData()
  form.set('audio', new Blob(['text'], { type: 'text/plain' }), 'text.txt')
  const response = await POST(new Request('http://localhost', { method: 'POST', body: form }))
  assert.equal(response.status, 400)
  assert.equal(state.calls, 0)
})

test('provider result is normalized before returning, no global key fallback', async () => {
  let calls = 0
  const fetchImpl = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.aitunnel.ru/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer company-test')
    assert.ok(options.signal)
    return Response.json({ choices: [{ message: { content: JSON.stringify({ patch: { title: 'День рождения', clientId: 'foreign', tenantId: 'foreign', status: 'closed' }, notes: ['Уточните клиента'] }) } }] })
  }
  const result = await preparePartyOrderAi({ text: 'День рождения', draft: {}, catalogs: { clients: [] }, settings: { aitunnelKey: 'company-test' }, fetchImpl })
  assert.deepEqual(result.patch, { title: 'День рождения' })
  await assert.rejects(preparePartyOrderAi({ settings: {}, fetchImpl }), /AI_NOT_CONFIGURED/)
  assert.equal(calls, 1)
})
