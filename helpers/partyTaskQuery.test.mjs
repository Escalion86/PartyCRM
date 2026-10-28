import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePartyTaskQuery, buildPartyTaskQueryFilter, matchesPartyTaskQuery } from './partyTaskQuery.js'

const staffId = '1'.repeat(24), roleId = '2'.repeat(24), userId = '3'.repeat(24)
const context = { staff: { _id: staffId, positionId: roleId }, sessionUser: { _id: userId } }
const parse = (text = '', options) => parsePartyTaskQuery(new URLSearchParams(text), options)
const task = { status: 'new', title: 'Позвонить [VIP]', orderTitle: 'День рождения', dueAt: '2026-10-28T03:00:00.000Z', assigneeStaffIds: [staffId], assigneeRoleId: roleId, createdByUserId: userId }
const now = new Date('2026-10-28T10:00:00.000Z')

test('task query defaults preserve the unfiltered legacy endpoint and normalize literal search', () => {
  const query = parse('search=%20%5BViP%5D%20', { now })
  assert.equal(query.filter, 'all')
  assert.equal(query.scope, 'all')
  assert.equal(query.search, '[vip]')
  assert.equal(matchesPartyTaskQuery(task, query, context), true)
  assert.equal(matchesPartyTaskQuery({ ...task, title: 'Позвонить VIP' }, query, context), false)
  assert.equal(matchesPartyTaskQuery(task, parse('search=%D0%B4%D0%B5%D0%BD%D1%8C'), context), true)
  assert.equal(matchesPartyTaskQuery(task, parse('search=.*'), context), false)
})

test('invalid filters, identifiers, search and day ranges fail before querying data', () => {
  for (const query of [
    'filter=unknown', 'scope=everyone', 'status=archived', 'cursor=bad', 'orderId=bad',
    `search=${'a'.repeat(241)}`, 'now=2026-10-28', 'now=invalid', 'now=2026-02-30T00:00:00Z', 'now=2026-10-28T24:00:00Z',
    'dayFrom=2026-10-28T00:00:00Z',
    'dayTo=2026-10-29T00:00:00Z',
    'dayFrom=2026-10-28T00:00:00Z&dayTo=2026-10-28T01:00:00Z',
    'dayFrom=2026-10-28T00:00:00Z&dayTo=2026-12-28T00:00:00Z',
    'dayFrom=2026-10-29T00:00:00Z&dayTo=2026-10-28T00:00:00Z',
  ]) assert.throws(() => parse(query), (error) => error.status === 400, query)
})

test('status filter and a board column intersect instead of replacing one another', () => {
  const query = parse('filter=open&status=done')
  assert.deepEqual(buildPartyTaskQueryFilter(query, context), [
    { status: 'done' }, { status: { $in: ['new', 'in_progress'] } },
  ])
  assert.equal(matchesPartyTaskQuery({ ...task, status: 'done' }, query, context), false)
  assert.equal(matchesPartyTaskQuery(task, query, context), false)
})

test('mine, position and author are separate filters and never grant additional access', () => {
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=mine'), context), [{ assigneeStaffIds: staffId }])
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=role'), context), [{ assigneeRoleId: roleId }])
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=role'), { staff: { _id: staffId } }), [{ _id: { $in: [] } }])
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=created'), context), [{ $or: [{ createdByStaffId: staffId }, { createdByUserId: userId }] }])
  for (const scope of ['mine', 'role', 'created']) assert.equal(matchesPartyTaskQuery(task, parse(`scope=${scope}`), context), true)
  // Assignment scopes run in the ACL query so a blocked own task remains visible
  // as a safe placeholder after its assignment fields have been masked.
  assert.equal(matchesPartyTaskQuery({ ...task, assigneeStaffIds: [], assigneeRoleId: null }, parse('scope=mine')), true)
})

test('synthetic developer staff IDs never enter ObjectId filters and user-created tasks remain discoverable', () => {
  const developer = { staff: { _id: 'dev:synthetic:staff' }, sessionUser: { _id: userId } }
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=mine'), developer), [{ _id: { $in: [] } }])
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=role'), developer), [{ _id: { $in: [] } }])
  assert.deepEqual(buildPartyTaskQueryFilter(parse('scope=created'), developer), [{ $or: [{ createdByUserId: userId }] }])
})

test('today respects explicit local-day bounds and its exclusive upper boundary', () => {
  const query = parse('filter=today&dayFrom=2026-10-27T17:00:00Z&dayTo=2026-10-28T17:00:00Z')
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: '2026-10-27T17:00:00Z' }, query, context), true)
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: '2026-10-28T16:59:59Z' }, query, context), true)
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: '2026-10-28T17:00:00Z' }, query, context), false)
  assert.equal(matchesPartyTaskQuery({ ...task, status: 'done' }, query, context), false)
})

test('today fallback uses company time zone including a 25-hour daylight-saving day', () => {
  const krasnoyarsk = parse('filter=today', { now, timeZone: 'Asia/Krasnoyarsk' })
  assert.equal(krasnoyarsk.dayFrom.toISOString(), '2026-10-27T17:00:00.000Z')
  assert.equal(krasnoyarsk.dayTo.toISOString(), '2026-10-28T17:00:00.000Z')
  const berlin = parse('filter=today', { now: new Date('2026-10-25T12:00:00Z'), timeZone: 'Europe/Berlin' })
  assert.equal(+berlin.dayTo - +berlin.dayFrom, 25 * 3600000)
})

test('overdue and undated operate only on visible due date and open status', () => {
  const overdue = parse('filter=overdue&now=2026-10-28T10:00:00Z')
  assert.equal(matchesPartyTaskQuery(task, overdue, context), true)
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: null }, overdue, context), false)
  assert.equal(matchesPartyTaskQuery({ ...task, status: 'done' }, overdue, context), false)
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: '2026-10-28T10:00:00Z' }, overdue, context), false)
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: null }, parse('filter=undated'), context), true)
  assert.equal(matchesPartyTaskQuery({ ...task, dueAt: null, status: 'canceled' }, parse('filter=undated'), context), false)
})
