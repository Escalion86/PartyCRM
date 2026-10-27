import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const strip = (value) => value.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ').replaceAll('export async function ', 'async function ')
const lockSource = strip(await readFile(new URL('./partyStaffMutation.js', import.meta.url), 'utf8'))
const routeSource = strip(await readFile(new URL('../app/api/party/staff/[id]/route.js', import.meta.url), 'utf8'))
const tenantId = 'a'.repeat(24), firstId = 'b'.repeat(24), secondId = 'c'.repeat(24), targetId = 'd'.repeat(24)
const owner = (id) => ({ _id: id, tenantId, role: 'owner', status: 'active', positionId: null, authUserId: id })
const context = (staff) => ({ tenantId, role: staff.role, staff: structuredClone(staff), sessionUser: { _id: staff.authUserId, role: 'user' } })
const clone = (value) => structuredClone(value)
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => value?.$ne !== undefined ? String(row[key]) !== String(value.$ne) : String(row[key]) === String(value))
const query = (read) => ({ session() { return this }, lean: async () => clone(await read()), then(resolve, reject) { return Promise.resolve().then(read).then(resolve, reject) } })

function setup(staff, { failDemotion = false } = {}) {
  const env = { staff: clone(staff), tail: Promise.resolve(), ended: 0, lockTenants: [] }
  const Staff = {
    findOne: (filter) => query(() => env.staff.find((row) => matches(row, filter)) || null),
    countDocuments: (filter) => query(() => env.staff.filter((row) => matches(row, filter)).length),
    findOneAndUpdate: (filter, update, options) => query(() => {
      assert.ok(options.session, 'All staff writes must use the tenant transaction')
      if (failDemotion && update.$set.role === 'admin') throw new Error('Simulated second write failure')
      const row = env.staff.find((entry) => matches(entry, filter))
      if (!row) return null
      Object.assign(row, clone(update.$set)); return row
    }),
  }
  const Lock = {
    init: async () => {},
    updateOne: async (filter) => { env.lockTenants.push(filter.tenantId); return { modifiedCount: 1 } },
    db: { startSession: async () => ({
      endSession: async () => { env.ended += 1 },
      withTransaction: async (work) => {
        const previous = env.tail; let release; env.tail = new Promise((resolve) => { release = resolve }); await previous
        const snapshot = clone(env.staff)
        try { return await work() }
        catch (error) { env.staff = snapshot; throw error }
        finally { release() }
      },
    }) },
  }
  const factory = new Function('getPartyStaffModel', 'getProductModel', `${lockSource}\nreturn createPartyStaffMutationLock`)(async () => Staff, () => { throw new Error('No real model allowed') })
  const withPartyStaffMutationLock = factory({ getLock: async () => Lock, getStaff: async () => Staff })
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyStaffModel: async () => Staff, withPartyStaffMutationLock, canPartyAccess,
    getPartyRequestContext: async ({ req }) => ({ context: req.context }),
    parseJsonBody: async (req) => req.json(),
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value || '')),
    partyError: (status, code, message) => ({ status, body: { success: false, error: { code, message } } }),
    validateStaffLocationScope: async () => [], getPartyStaffPositionPatch: async () => { throw new Error('No position lookup expected') },
  }
  const routes = new Function(...Object.keys(deps), `${routeSource}\nreturn {PATCH,DELETE}`)(...Object.values(deps))
  const patch = (actor, target, body) => routes.PATCH({ context: actor, json: async () => body }, { params: Promise.resolve({ id: target }) })
  return { env, patch, routes }
}

test('simultaneous owners cannot demote each other and leave the company ownerless', async () => {
  const first = owner(firstId), second = owner(secondId)
  const h = setup([first, second])
  const results = await Promise.all([h.patch(context(first), secondId, { role: 'performer' }), h.patch(context(second), firstId, { role: 'performer' })])
  assert.deepEqual(results.map((result) => result.status), [200, 403])
  assert.equal(h.env.staff.filter((row) => row.role === 'owner' && row.status === 'active').length, 1)
  assert.equal(h.env.ended, 2)
  assert.equal(h.env.lockTenants.every((id) => id === tenantId), true)
})

test('simultaneous owners cannot both pause their own access', async () => {
  const first = owner(firstId), second = owner(secondId)
  const h = setup([first, second])
  const results = await Promise.all([h.patch(context(first), firstId, { status: 'paused' }), h.patch(context(second), secondId, { status: 'paused' })])
  assert.deepEqual(results.map((result) => result.status), [200, 400])
  assert.equal(h.env.staff.filter((row) => row.role === 'owner' && row.status === 'active').length, 1)
})

test('including the unchanged owner role does not bypass the last-active-owner check', async () => {
  const first = owner(firstId)
  const h = setup([first])
  const result = await h.patch(context(first), firstId, { role: 'owner', status: 'paused' })
  assert.equal(result.status, 400)
  assert.equal(h.env.staff[0].status, 'active')
})

test('a failure during owner transfer rolls back the target and preserves the previous owner', async () => {
  const first = owner(firstId)
  const target = { ...owner(targetId), role: 'performer' }
  const h = setup([first, target], { failDemotion: true })
  const result = await h.patch(context(first), targetId, { role: 'owner' })
  assert.equal(result.status, 500)
  assert.equal(h.env.staff.find((row) => row._id === firstId).role, 'owner')
  assert.equal(h.env.staff.find((row) => row._id === targetId).role, 'performer')
})
