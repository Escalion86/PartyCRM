import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'

const id = '507f1f77bcf86cd799439011'
const load = async (path, deps, name) => {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
  return compileFunction(`${source}\nreturn ${name}`, Object.keys(deps))(...Object.values(deps))
}
const q = value => ({ lean: async () => value })
const base = {
  getPartyRequestContext: async () => ({ context: { tenantId: 'company', company: {} } }),
  isValidObjectId: value => /^[a-f\d]{24}$/i.test(value),
  parseJsonBody: async req => req.body,
  partyError: (status, code) => ({ status, code }),
  NextResponse: { json: body => ({ status: 200, body }) },
}

test('preview resolves stored tenant membership and ignores supplied group metadata', async () => {
  let checked
  const POST = await load('../app/api/party/orders/check-conflicts/route.js', {
    ...base,
    normalizeOrderPayload: body => body, validateOrderReferences: async () => null,
    getPartyOrderModel: async () => ({ findOne(filter) { assert.deepEqual(filter, { _id: id, tenantId: 'company' }); return q({ _id: id }) } }),
    getPartySharedLocationOrderIds: async args => { assert.deepEqual(args, { tenantId: 'company', orderId: id }); return ['trusted'] },
    findPartyOrderConflicts: async args => { checked = args; return { locationConflicts: [], staffConflicts: [] } },
  }, 'POST')
  const response = await POST({ body: { orderId: id, eventDate: '2026-09-17', dateEnd: '2026-09-18', partyEventGroupId: 'forged', sharedLocationOrderIds: ['forged'] } })
  assert.equal(response.status, 200)
  assert.deepEqual(checked.sharedLocationOrderIds, ['trusted'])
  assert.equal(checked.excludeOrderId, id)
})

test('preview rejects another tenant order before resolving its group', async () => {
  const POST = await load('../app/api/party/orders/check-conflicts/route.js', {
    ...base, normalizeOrderPayload: body => body, validateOrderReferences: async () => null,
    getPartyOrderModel: async () => ({ findOne: () => q(null) }),
    getPartySharedLocationOrderIds: () => assert.fail('must not resolve foreign order'),
  }, 'POST')
  assert.equal((await POST({ body: { orderId: id, eventDate: '2026-09-17', dateEnd: '2026-09-18' } })).status, 404)
})

test('status-only reactivation checks venue and staff before writing', async () => {
  const PATCH = await load('../app/api/party/orders/[id]/route.js', {
    ...base, getPartyOrderWriteGuard,
    getPartyOrderModel: async () => ({ findOne: () => q({ _id: id, status: 'canceled' }), findOneAndUpdate: () => assert.fail('must not write conflicting activation') }),
    getPartySharedLocationOrderIds: async () => ['trusted'],
    findPartyOrderConflicts: async args => { assert.equal(args.payload.status, 'active'); assert.deepEqual(args.sharedLocationOrderIds, ['trusted']); return { locationConflicts: [{ _id: 'outside' }] } },
    hasPartyOrderConflicts: value => value.locationConflicts.length > 0,
  }, 'PATCH')
  assert.equal((await PATCH({ body: { status: 'active' } }, { params: { id } })).status, 409)
})

test('order guard rejects changed shared booking revision even without legacy timestamps', () => {
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return value.every(part => matches(doc, part))
    if (key === '$or') return value.some(part => matches(doc, part))
    if (value && typeof value === 'object' && '$exists' in value) return Object.hasOwn(doc, key) === value.$exists
    return doc[key] === value
  })
  for (const sharedLocationRevision of [undefined, 0, 3]) {
    const current = { status: 'active', ...(sharedLocationRevision === undefined ? {} : { sharedLocationRevision }) }
    const guard = getPartyOrderWriteGuard(current)
    assert.equal(matches(current, guard), true)
    assert.equal(matches({ ...current, sharedLocationRevision: Number(sharedLocationRevision || 0) + 1 }, guard), false)
  }
})
