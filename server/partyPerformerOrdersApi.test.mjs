import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { sanitizePartyOrderForPerformer } from '../helpers/partyPerformerOrders.js'

const code = (await readFile(new URL('../app/api/party/performer/orders/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
  .replace('export async function GET', 'async function GET')
const query = (value) => ({ sort() { return this }, select() { return this }, limit() { return this }, lean: async () => value })

test('performer GET hydrates customer and onsite within each tenant without querying payer or partner', async () => {
  const tenants = ['company-a', 'company-b']
  const filters = []
  const memberships = tenants.map((tenantId) => ({ tenantId, staffId: 'staff', role: 'performer' }))
  const orders = tenants.map((tenantId) => ({
    _id: tenantId, tenantId, clientId: 'customer', assignedStaff: [{ staffId: 'staff' }],
    contactRoles: { onsiteClientId: 'onsite', partnerClientId: 'private-partner', payerClientId: 'private-payer', representAs: tenantId },
  }))
  const clients = tenants.flatMap((tenantId) => ['customer', 'onsite'].map((_id) => ({
    _id, tenantId, firstName: `${tenantId}-${_id}`, phone: `${tenantId}-phone`, internalNotes: 'secret',
  })))
  const emptyModel = async () => ({ find: () => query([]) })
  const deps = {
    NextResponse: { json: (body) => body },
    getPartyMembershipContext: async (options) => {
      assert.equal(options.excludeLocationOwners, true)
      return { sessionUser: { _id: 'user' }, memberships }
    },
    isValidObjectId: () => true,
    getPartyOrderModel: async () => ({ find: (filter) => {
      assert.deepEqual(filter.$or, tenants.map((tenantId) => ({ tenantId, 'assignedStaff.staffId': 'staff' })))
      return query(orders)
    } }),
    getPartyClientModel: async () => ({ find: (filter) => { filters.push(filter); return query(clients) } }),
    getPartyLocationModel: emptyModel, getPartyServiceModel: emptyModel, getPartyStaffModel: emptyModel,
    sanitizePartyOrderForPerformer,
  }
  const GET = new Function(...Object.keys(deps), `${code}\nreturn GET`)(...Object.values(deps))
  const result = await GET()
  assert.deepEqual(filters[0].$or, tenants.flatMap((tenantId) => ['customer', 'onsite'].map((_id) => ({ _id, tenantId, status: { $ne: 'archived' } }))))
  assert.equal(result.data.length, 2)
  for (const [index, item] of result.data.entries()) {
    assert.equal(item.companyId, tenants[index])
    assert.equal(item.client.name, `${tenants[index]}-customer`)
    assert.equal(item.onsiteContact.name, `${tenants[index]}-onsite`)
    assert.deepEqual(Object.keys(item.onsiteContact), ['name', 'phone', 'email'])
    assert.equal(Object.hasOwn(item, 'contactRoles'), false)
  }
  assert.equal(JSON.stringify(result).includes('private-'), false)
  assert.equal(JSON.stringify(result).includes('secret'), false)
})
