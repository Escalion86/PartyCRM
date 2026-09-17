import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculatePartyInboxResponseDueAt, isPartyInboxMeaningfulContent } from '../helpers/partyInboxSla.js'
import { defaultPartyInboxSchedule } from '../helpers/partyInboxSchedule.js'

const source = (await readFile(new URL('./partyInboxLifecycle.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')

test('incoming reads company calendar and persists deadline; duplicate cannot reschedule old SLA', async () => {
  let current = null
  let queriedTenant
  let selected
  const settings = { timeZone: 'Asia/Krasnoyarsk', inboxSchedule: defaultPartyInboxSchedule() }
  settings.inboxSchedule.exceptions = [{ date: '2026-09-07', closed: true }]
  const Company = { findOne(filter) { queriedTenant = filter._id; return { select(value) { selected = value; return { lean: async () => ({ settings }) } } } } }
  const State = {
    findOne: () => ({ lean: async () => current }),
    create: async (value) => { current = { _id: 'state', ...value }; return { toObject: () => current } },
    findOneAndUpdate(filter, update) {
      assert.equal(filter.tenantId, 'company')
      assert.equal(filter.revision, current.revision)
      return { lean: async () => { current = { ...current, ...update.$set, revision: current.revision + 1 }; return current } }
    },
  }
  const { registerPartyInboxIncoming, registerPartyInboxOutgoing } = new Function('getPartyCompanyModel', 'getPartyInboxStateModel', 'calculatePartyInboxResponseDueAt', 'isPartyInboxMeaningfulContent', `${source}; return { registerPartyInboxIncoming, registerPartyInboxOutgoing }`)(async () => Company, async () => State, calculatePartyInboxResponseDueAt, isPartyInboxMeaningfulContent)
  const request = { tenantId: 'company', channel: 'vk', sourceId: 'conversation', token: 'first', at: '2026-09-07T04:00:00Z', text: 'Вопрос' }
  const first = await registerPartyInboxIncoming(request)
  assert.equal(queriedTenant, 'company')
  assert.equal(selected, 'settings.timeZone settings.inboxSchedule')
  assert.equal(first.responseDueAt.toISOString(), '2026-09-08T02:30:00.000Z')
  settings.inboxSchedule.exceptions = []
  assert.equal((await registerPartyInboxIncoming(request)).responseDueAt.toISOString(), '2026-09-08T02:30:00.000Z')
  assert.equal(current.revision, 1)
  assert.equal((await registerPartyInboxIncoming({ ...request, token: 'second' })).responseDueAt.toISOString(), '2026-09-07T04:15:00.000Z')
  const response = await registerPartyInboxOutgoing({ ...request, token: 'reply', at: '2026-09-07T04:02:00Z' })
  assert.equal(response.responseDueAt, null)
  assert.equal(response.respondedAt.toISOString(), '2026-09-07T04:02:00.000Z')
})
