import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('../app/api/party/orders/[id]/report-coordinator/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
  .replaceAll('export async function ', 'async function ')
const tenantId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const id = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const staffId = 'cccccccccccccccccccccccc'
const query = (value) => ({ select() { return this }, lean: async () => value })
const params = { id }
function setup({ denied = false, missing = false, status = 'active', eligible = true, conflict = false, coordinator = staffId, dbFailure = false } = {}) {
  const reads = [], writes = []
  const order = { _id: id, status, reportCoordinatorStaffId: coordinator, assignedStaff: [{ staffId }] }
  const staff = eligible ? [{ _id: staffId, firstName: 'Анна', secondName: '' }] : []
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body, headers: new Headers() }) },
    getPartyRequestContext: async (options) => {
      assert.equal(options.managementOnly, true)
      return denied ? { error: { status: 403, headers: new Headers() } } : { context: { tenantId } }
    },
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value)),
    parseJsonBody: (req) => req.json(),
    partyError: (status, code, message) => ({ status, body: { error: { code, message } }, headers: new Headers() }),
    getPartyOrderModel: async () => ({
      findOne: (filter) => { if (dbFailure) throw new Error('mongodb secret connection'); reads.push(filter); return query(missing ? null : order) },
      findOneAndUpdate: (filter, update) => {
        writes.push({ filter, update })
        return query(conflict ? null : { ...order, ...update.$set, reportCoordinatorRevision: 1 })
      },
    }),
    getPartyStaffModel: async () => ({ find: (filter) => { reads.push(filter); return query(staff) } }),
  }
  return { ...new Function(...Object.keys(deps), `${source}\nreturn {GET, PATCH}`)(...Object.values(deps)), reads, writes }
}
const req = (body = { staffId, expectedRevision: 0 }) => ({ json: async () => body })

test('authorization and order existence precede reads and writes', async () => {
  const denied = setup({ denied: true })
  assert.equal((await denied.GET(req(), { params })).status, 403)
  assert.equal((await denied.PATCH(req(), { params })).status, 403)
  assert.equal(denied.reads.length, 0)
  assert.equal((await setup({ missing: true }).PATCH(req(), { params })).status, 404)
})
test('GET hides a removed or inactive coordinator and scopes candidates to company', async () => {
  const route = setup({ eligible: false })
  const result = await route.GET(req(), { params })
  assert.equal(result.body.data.coordinatorStaffId, null)
  assert.equal(result.body.data.revision, 0)
  assert.equal(result.body.data.suggested, false)
  assert.equal(route.reads[1].status, 'active')
  assert.deepEqual(route.reads[1]._id, { $in: [staffId] })
  assert.ok(route.reads.every((filter) => filter.tenantId === tenantId))
})
test('assignment uses revision CAS and requires membership at write time', async () => {
  const route = setup()
  assert.equal((await route.PATCH(req(), { params })).status, 200)
  const { filter, update } = route.writes[0]
  assert.equal(filter.tenantId, tenantId)
  assert.deepEqual(filter.$or, [{ reportCoordinatorRevision: 0 }, { reportCoordinatorRevision: { $exists: false } }])
  assert.deepEqual(filter.assignedStaff, { $elemMatch: { staffId, confirmationStatus: { $ne: 'declined' } } })
  assert.equal(update.$inc.reportCoordinatorRevision, 1)
  assert.equal((await setup({ conflict: true }).PATCH(req(), { params })).status, 409)
})
test('unassign supports null; invalid, inactive and canceled assignments are rejected', async () => {
  assert.equal((await setup().PATCH(req({ staffId: null, expectedRevision: 0 }), { params })).status, 200)
  assert.equal((await setup({ eligible: false }).PATCH(req(), { params })).status, 400)
  assert.equal((await setup({ status: 'canceled' }).PATCH(req(), { params })).status, 409)
  for (const body of [{ staffId }, { staffId: 'bad', expectedRevision: 0 }, { staffId, expectedRevision: -1 }]) {
    const route = setup()
    assert.equal((await route.PATCH(req(body), { params })).status, 400)
    assert.equal(route.writes.length, 0)
  }
})

test('database failures are safe JSON errors and all responses disable caching', async () => {
  for (const method of ['GET', 'PATCH']) {
    const result = await setup({ dbFailure: true })[method](req(), { params })
    assert.equal(result.status, 500)
    assert.equal(result.body.error.code, 'partycrm_report_coordinator_failed')
    assert.doesNotMatch(JSON.stringify(result.body), /mongodb|secret|connection/)
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
    const success = await setup()[method](req(), { params })
    assert.equal(success.headers.get('Cache-Control'), 'private, no-store')
    const denied = await setup({ denied: true })[method](req(), { params })
    assert.equal(denied.headers.get('Cache-Control'), 'private, no-store')
  }
})
