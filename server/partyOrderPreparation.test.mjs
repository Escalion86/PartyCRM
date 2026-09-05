import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePartyOrderPreparation } from './partyOrderPreparation.js'

const tenantId = '507f1f77bcf86cd799439010'
const managerId = '507f1f77bcf86cd799439011'
const responsibleId = '507f1f77bcf86cd799439012'
const Staff = { countDocuments: async (query) => query.tenantId === tenantId && String(query._id.$in[0]) === responsibleId ? 1 : 0 }

test('normalization stamps manager transitions and permits assembly planned days before event', async () => {
  const preparation = await normalizePartyOrderPreparation({ tenantId, staffId: managerId, dependencies: { Staff }, input: { enabled: true, items: [{ title: 'Собрать костюм', responsibleStaffId: responsibleId, status: 'done', dueAt: '2026-09-07T03:00:00Z' }], clientCheck: { status: 'message_received' }, assembly: { status: 'ready', plannedAt: '2026-09-05T03:00:00Z' }, addressChange: { before: 'Было', after: 'Стало' } } })
  assert.equal(preparation.revision, 1)
  assert.equal(String(preparation.items[0].completedByStaffId), managerId)
  assert.equal(String(preparation.clientCheck.checkedByStaffId), managerId)
  assert.equal(preparation.assembly.plannedAt.toISOString(), '2026-09-05T03:00:00.000Z')
  assert.deepEqual(preparation.addressChange.acknowledgements, [])
})

test('address edit resets acknowledgements and unchanged edit preserves them', async () => {
  const current = { revision: 3, items: [], addressChange: { before: 'A', after: 'B', acknowledgements: [{ staffId: responsibleId, acknowledgedAt: new Date() }] } }
  const unchanged = await normalizePartyOrderPreparation({ tenantId, staffId: managerId, current, input: { enabled: true, items: [], clientCheck: {}, assembly: {}, addressChange: { before: 'A', after: 'B' } } })
  assert.equal(unchanged.addressChange.acknowledgements.length, 1)
  const changed = await normalizePartyOrderPreparation({ tenantId, staffId: managerId, current, input: { enabled: true, items: [], clientCheck: {}, assembly: {}, addressChange: { before: 'A', after: 'C' } } })
  assert.deepEqual(changed.addressChange.acknowledgements, [])
})

test('normalization rejects foreign responsible staff and incomplete address pair', async () => {
  await assert.rejects(normalizePartyOrderPreparation({ tenantId: '507f1f77bcf86cd799439099', staffId: managerId, dependencies: { Staff }, input: { items: [{ title: 'Task', responsibleStaffId: responsibleId }] } }), /не найден/)
  await assert.rejects(normalizePartyOrderPreparation({ tenantId, staffId: managerId, input: { items: [], addressChange: { before: 'A' } } }), /«было» и «стало»/)
})
