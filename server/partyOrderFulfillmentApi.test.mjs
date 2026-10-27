import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canPartyAccess,
  filterPartyOrderForAccess,
} from '../helpers/partyRolePermissions.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'

const source = (
  await readFile(
    new URL(
      '../app/api/party/orders/[id]/fulfillment/route.js',
      import.meta.url
    ),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace('export async function POST', 'async function POST')
const tenantId = 'a'.repeat(24),
  id = 'b'.repeat(24),
  actor = 'c'.repeat(24)
const base = {
  _id: id,
  tenantId,
  eventDate: '2026-01-10T10:00:00Z',
  dateEnd: '2026-01-10T12:00:00Z',
  contractAmount: 1500.55,
  status: 'active',
  updatedAt: '2026-01-11T00:00:00.000Z',
}
const owner = {
  tenantId,
  role: 'owner',
  staff: { _id: actor, tenantId, role: 'owner', status: 'active' },
}
const setup = ({
  order = base,
  context = owner,
  stale = false,
  authError,
} = {}) => {
  const writes = [],
    audits = []
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyRequestContext: async () =>
      authError ? { error: authError } : { context },
    isValidObjectId: (value) => /^[a-f0-9]{24}$/.test(value),
    parseJsonBody: (req) => req.body,
    partyError: (status, code, message) => ({
      status,
      body: { error: { code, message } },
    }),
    getPartyOrderModel: async () => ({
      findOne: (filter) => ({
        lean: async () => {
          assert.deepEqual(filter, { _id: id, tenantId })
          return structuredClone(order)
        },
      }),
      findOneAndUpdate: (filter, update) => ({
        lean: async () => {
          writes.push({ filter, update })
          return stale ? null : { ...order, ...update.$set }
        },
      }),
    }),
    canPartyAccess,
    filterPartyOrderForAccess,
    parsePartyIsoDate,
    recordPartyOrderAudit: async (record) => audits.push(record),
  }
  const POST = new Function(...Object.keys(deps), `${source}\nreturn POST`)(
    ...Object.values(deps)
  )
  return {
    writes,
    audits,
    run: (body = {}) =>
      POST(
        {
          body: {
            action: 'complete',
            expectedUpdatedAt: base.updatedAt,
            ...body,
          },
        },
        { params: Promise.resolve({ id }) }
      ),
  }
}
test('fulfillment snapshots agreed cents without closing or paying the order and uses an optimistic revision', async () => {
  const api = setup(),
    response = await api.run()
  assert.equal(response.status, 200)
  assert.equal(response.body.data.status, 'active')
  assert.equal(response.body.data.fulfillment.amountKopecks, 150055)
  assert.equal(api.writes[0].filter.updatedAt.toISOString(), base.updatedAt)
  assert.equal(api.writes[0].update.$inc.commercialRevision, 1)
  assert.equal(api.audits.length, 1)
  const stale = setup({ stale: true })
  assert.equal((await stale.run()).status, 409)
  assert.equal(stale.audits.length, 0)
})
test('future, canceled and impossible dates cannot claim earned services', async () => {
  for (const order of [
    { ...base, eventDate: '2099-01-01' },
    { ...base, dateEnd: '2099-01-01' },
    { ...base, status: 'canceled' },
  ]) {
    const api = setup({ order })
    assert.equal((await api.run()).status, 400)
    assert.equal(api.writes.length, 0)
  }
  for (const body of [
    { performedAt: '2026-02-30T10:00:00Z' },
    { performedAt: '2026-01-01T10:00:00Z' },
    { expectedUpdatedAt: '2026-02-30T10:00:00Z' },
    { expectedUpdatedAt: 123 },
  ]) {
    const api = setup()
    assert.equal((await api.run(body)).status, 400)
    assert.equal(api.writes.length, 0)
  }
})

test('legacy orders without dateEnd still respect the planned duration', async () => {
  const api = setup({ order: { ...base, eventDate: new Date(Date.now() - 60000), dateEnd: null, durationMinutes: 60 } })
  assert.equal((await api.run()).status, 400)
  assert.equal(api.writes.length, 0)
})
test('dedicated permission, tenant scope and reason protect financial corrections', async () => {
  const scoped = {
    ...owner,
    role: 'performer',
    staff: { ...owner.staff, role: 'performer' },
    position: { permissions: { orders: 'read', 'orders.fulfillment': 'read' } },
  }
  const denied = setup({ context: scoped })
  assert.equal((await denied.run()).status, 403)
  assert.equal(denied.writes.length, 0)
  const other = setup({ order: { ...base, tenantId: 'other' } })
  assert.equal((await other.run()).status, 404)
  const marked = {
    ...base,
    fulfillment: { performedAt: base.dateEnd, amountKopecks: 150055 },
  }
  const api = setup({ order: marked })
  assert.equal((await api.run()).status, 409)
  assert.equal((await api.run({ action: 'undo' })).status, 400)
  assert.equal(
    (await api.run({ action: 'undo', reason: 'Ошибочно отметили' })).status,
    200
  )
  assert.equal(api.writes[0].update.$set.fulfillment.performedAt, null)
  assert.equal(api.audits[0].metadata.reason, 'Ошибочно отметили')
  const noAuth = setup({ authError: { status: 401 } })
  assert.equal((await noAuth.run()).status, 401)
})
