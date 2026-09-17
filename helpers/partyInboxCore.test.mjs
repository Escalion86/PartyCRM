import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('./partyInboxCore.js', import.meta.url), 'utf8')
const { resolvePartyInboxStatus, parsePartyInboxPatch, buildPartyInboxWorkflowUpdate } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('a new incoming reopens resolved and waiting conversations, even during saving', () => {
  for (const status of ['resolved', 'waiting_client', 'follow_up', 'in_progress']) {
    const state = { status, acknowledgedIncomingToken: 'message-1' }
    assert.equal(resolvePartyInboxStatus(state, 'message-1'), status)
    assert.equal(resolvePartyInboxStatus(state, 'message-2'), 'needs_reply')
  }
})

test('reading, sending outgoing messages and call delivery updates do not resolve incoming', () => {
  assert.equal(resolvePartyInboxStatus(null, 'incoming-1'), 'needs_reply')
  assert.equal(resolvePartyInboxStatus({ status: 'resolved', acknowledgedIncomingToken: 'incoming-1' }, 'incoming-1'), 'resolved')
  assert.equal(resolvePartyInboxStatus(null, '', 'outgoing'), 'in_progress')
})

const valid = { status: 'follow_up', nextContactAt: '2026-09-20T10:00:00.000Z', expectedRevision: 2, clientId: '0123456789abcdef01234567' }

test('sales stage is explicit, requires a loss reason or booking link, and legacy patches preserve it', () => {
  assert.equal(Object.hasOwn(parsePartyInboxPatch(valid), 'salesStage'), false)
  assert.throws(() => parsePartyInboxPatch({ ...valid, salesStage: '__proto__' }), /этап/)
  assert.throws(() => parsePartyInboxPatch({ ...valid, salesStage: 'lost', lostReason: '  ' }), /причину/)
  assert.throws(() => parsePartyInboxPatch({ ...valid, salesStage: 'won' }), /заказом/)
  const parsed = parsePartyInboxPatch({ ...valid, salesStage: 'lost', lostReason: ' Выбрали другую программу ' })
  assert.equal(parsed.lostReason, 'Выбрали другую программу')
  assert.equal(parsed.status, 'follow_up')
})

test('sales history records only actual changes and does not fabricate replies', () => {
  const now = new Date('2026-09-07T10:00:00Z')
  const patch = parsePartyInboxPatch({ ...valid, salesStage: 'proposal' })
  const result = buildPartyInboxWorkflowUpdate({ patch, current: { salesStage: 'qualification', responseDueAt: now }, channel: 'vk', actorStaffId: 'staff', now })
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].type, 'sales_stage_changed')
  assert.equal(result.events[0].fromSalesStage, 'qualification')
  assert.equal(Object.hasOwn(result.fields, 'responseDueAt'), false)
  assert.equal(Object.hasOwn(result.fields, 'expectedRevision'), false)
  assert.equal(buildPartyInboxWorkflowUpdate({ patch, current: { salesStage: 'proposal' }, channel: 'vk' }).events.length, 0)
})

test('explicit call outcome closes its SLA; a message outcome alone does not', () => {
  const current = { responseDueAt: new Date('2026-09-06T10:00:00Z'), revision: 3 }
  const patch = parsePartyInboxPatch({ status: 'resolved', expectedRevision: 3, nextContactAt: '2026-09-06' })
  const call = buildPartyInboxWorkflowUpdate({ patch, current, channel: 'novofon' })
  assert.equal(call.fields.responseDueAt, null)
  assert.equal(call.fields.nextContactAt, null)
  assert.equal(call.events[0].type, 'sla_answered')
  const message = buildPartyInboxWorkflowUpdate({ patch, current, channel: 'vk' })
  assert.equal(Object.hasOwn(message.fields, 'responseDueAt'), false)
})

test('follow-up requires a valid explicit date, never interprets a phrase', () => {
  assert.throws(() => parsePartyInboxPatch({ ...valid, nextContactAt: '' }), /дату/)
  assert.throws(() => parsePartyInboxPatch({ ...valid, nextContactAt: 'завтра' }), /дата/)
  assert.throws(() => parsePartyInboxPatch({ ...valid, status: 'thanks' }), /состояние/)
  assert.equal(parsePartyInboxPatch(valid).nextContactAt.toISOString(), valid.nextContactAt)
  assert.throws(() => parsePartyInboxPatch({ ...valid, expectedRevision: 1.2 }), /Обновите/)
})

test('reference and operator injection rejected; tenant cannot be supplied in patch', () => {
  assert.throws(() => parsePartyInboxPatch({ ...valid, clientId: { $ne: null } }), /ссылка/)
  assert.throws(() => parsePartyInboxPatch({ ...valid, assigneeStaffId: 'invalid' }), /ссылка/)
  const parsed = parsePartyInboxPatch({ ...valid, tenantId: 'other-company', unexpected: true })
  assert.equal(parsed.tenantId, undefined)
  assert.equal(parsed.unexpected, undefined)
  assert.equal(parsed.assigneeStaffId, null)
})
