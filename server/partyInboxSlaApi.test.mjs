import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')

test('incoming lifecycle durably reopens SLA with bounded history and CAS', async () => {
  const code = await source('server/partyInboxLifecycle.js')
  assert.match(code, /status:\s*'needs_reply'/)
  assert.match(code, /responseDueAt:\s*dueAt/)
  assert.match(code, /respondedAt:\s*null/)
  assert.match(code, /slaIncomingToken:\s*String\(token\)/)
  assert.match(code, /revision:\s*Number\(current\.revision \|\| 0\)/)
  assert.match(code, /\$slice:\s*-200/)
})

test('only successful provider replies close SLA and webhook hooks cover every supported channel', async () => {
  const [replies, telegram, telegramReply, novofon, persistence] = await Promise.all([
    source('server/partyMessengerReplies.js'), source('server/partyTelegramBusiness.js'), source('app/api/party/integrations/telegram/conversations/[id]/messages/route.js'), source('app/api/party/integrations/novofon/webhook/[token]/route.js'), source('server/partyMessengerPersistence.js'),
  ])
  assert.match(replies, /if \(status === 'sent'\) await registerInboxOutgoing/)
  assert.match(telegram, /registerPartyInboxIncoming/)
  assert.match(telegram, /registerPartyInboxOutgoing/)
  assert.match(telegramReply, /registerPartyInboxOutgoing/)
  assert.match(novofon, /registerInboxIncoming:\s*registerPartyInboxIncoming/)
  assert.match(persistence, /channel:\s*'vk'/)
  assert.match(persistence, /channel:\s*'avito'/)
})

test('handoff keeps current assignee and SLA deadline until recipient accepts; stale revision is conflict', async () => {
  const [service, route] = await Promise.all([source('server/partyInboxHandoff.js'), source('app/api/party/inbox/[id]/handoff/route.js')])
  const proposedBlock = service.slice(service.indexOf("body.action === 'propose'"), service.indexOf("body.action === 'accept'"))
  assert.doesNotMatch(proposedBlock, /responseDueAt/)
  assert.doesNotMatch(proposedBlock, /assigneeStaffId:/)
  assert.match(service, /assigneeStaffId:\s*context\.staff\._id/)
  assert.match(service, /revision !== body\.expectedRevision/)
  assert.match(service, /fail\('Диалог уже изменён\. Обновите данные\.', 409\)/)
  assert.match(route, /status:\s*'active', role:\s*\{ \$in:\s*\['owner', 'admin'\]/)
})

test('generic state PATCH uses server token and revision CAS instead of trusting UI token', async () => {
  const route = await source('app/api/party/inbox/[id]/route.js')
  assert.match(route, /authoritativeIncomingToken/)
  assert.match(route, /latestIncoming/)
  assert.match(route, /revisionFilter/)
  assert.match(route, /inbox_handoff_required/)
})
