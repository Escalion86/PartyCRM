import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const code = await readFile(new URL('./partyInboxCore.js', import.meta.url), 'utf8')
const { resolvePartyInboxStatus, parsePartyInboxPatch } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

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
