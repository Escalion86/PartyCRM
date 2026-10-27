import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import partyOrdersSchema from '../schemas/partyOrdersSchema.js'
import { parsePartyOrderListQuery } from '../helpers/partyOrderListQuery.js'
import { buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'

test('list search, scoped cursor and local-day bounds cast with the actual order schema without a DB connection', () => {
  const tenantId = 'a'.repeat(24)
  const staffId = 'b'.repeat(24)
  const locationId = 'c'.repeat(24)
  const cursor = 'd'.repeat(24)
  const context = {
    tenantId,
    role: 'performer',
    staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId: 'position' },
    position: {
      active: true,
      permissions: { orders: 'read', 'orders.title': 'read', 'orders.eventDate': 'read', 'orders.workflowStageId': 'read' },
      orderScope: { locationIds: [locationId], includeUnlocated: false, assignedOnly: true },
    },
  }
  const params = new URLSearchParams({ view: 'list', q: 'Праздник .*', stageId: 'preparation', quick: 'today', todayFrom: '2026-10-26T17:00:00Z', todayTo: '2026-10-27T17:00:00Z', listCursor: cursor })
  const list = parsePartyOrderListQuery(params, context)
  const filter = { $and: [buildPartyOrderAccessFilter(context), ...list.clauses, { _id: { $lt: list.cursor } }] }
  const Model = mongoose.models.PartyOrderListCastProbe || mongoose.model('PartyOrderListCastProbe', new mongoose.Schema(partyOrdersSchema))
  const cast = Model.find(filter).sort({ _id: -1 }).limit(41).cast()
  const scope = cast.$and[0]
  assert.ok(scope.tenantId instanceof mongoose.Types.ObjectId)
  assert.equal(String(scope.tenantId), tenantId)
  assert.ok(scope.$and[0].locationId.$in[0] instanceof mongoose.Types.ObjectId)
  assert.equal(String(scope.$and[1].$or[0]['assignedStaff.staffId']), staffId)
  assert.equal(String(scope.$and[1].$or[1].responsibleStaffId), staffId)
  assert.deepEqual(cast.$and[1], { $or: [{ title: { $regex: 'Праздник \\.\\*', $options: 'i' } }] })
  assert.deepEqual(cast.$and[2], { workflowStageId: 'preparation' })
  assert.ok(cast.$and[3].eventDate.$gte instanceof Date)
  assert.equal(cast.$and[3].eventDate.$lt.toISOString(), '2026-10-27T17:00:00.000Z')
  assert.ok(cast.$and[4]._id.$lt instanceof mongoose.Types.ObjectId)
  assert.equal(String(cast.$and[4]._id.$lt), cursor)
  assert.equal(mongoose.connection.readyState, 0)
})
