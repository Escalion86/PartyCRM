import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartyOrderAuditChanges,
  getPartyAuditActor,
  getPartyOrderAuditTitle,
} from './partyAuditLogCore.js'

test('buildPartyOrderAuditChanges keeps only meaningful order changes', () => {
  const before = {
    _id: '66a000000000000000000001',
    title: 'День рождения',
    status: 'draft',
    contractAmount: 10000,
    eventDate: '2026-08-23T10:00:00.000Z',
  }
  const after = {
    ...before,
    status: 'active',
    contractAmount: 12000,
  }

  assert.deepEqual(buildPartyOrderAuditChanges(before, after), [
    {
      field: 'status',
      label: 'Статус',
      before: 'Заявка',
      after: 'Подтвержден',
    },
    {
      field: 'contractAmount',
      label: 'Сумма договора',
      before: '10 000 ₽',
      after: '12 000 ₽',
    },
  ])
})

test('getPartyAuditActor stores a readable actor snapshot', () => {
  assert.deepEqual(
    getPartyAuditActor({
      role: 'admin',
      staff: {
        _id: '66a000000000000000000002',
        firstName: 'Анна',
        secondName: 'Иванова',
      },
      sessionUser: { _id: 'user-1' },
    }),
    {
      actorUserId: 'user-1',
      actorStaffId: '66a000000000000000000002',
      actorName: 'Иванова Анна',
      actorRole: 'admin',
    }
  )
})

test('getPartyOrderAuditTitle survives deletion of the order', () => {
  assert.equal(
    getPartyOrderAuditTitle({
      _id: '66a000000000000000000003',
      title: 'Выпускной',
    }),
    'Выпускной'
  )
})
