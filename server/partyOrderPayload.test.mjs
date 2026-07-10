import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePartyOrderTiming } from './partyOrderPayload.js'
import {
  normalizePartyAdditionalEvents,
  normalizePartyOrderResponsibleStaffId,
} from './partyOrderPayload.js'

test('normalizePartyOrderTiming persists explicit duration and derives dateEnd', () => {
  const result = normalizePartyOrderTiming({
    eventDate: '2026-07-01T10:00:00.000Z',
    durationMinutes: '120',
    dateEnd: '',
  })

  assert.equal(result.durationMinutes, 120)
  assert.equal(result.dateEnd.toISOString(), '2026-07-01T12:00:00.000Z')
})

test('normalizePartyOrderTiming restores duration from existing dateEnd', () => {
  const result = normalizePartyOrderTiming({
    eventDate: '2026-07-01T10:00:00.000Z',
    durationMinutes: '',
    dateEnd: '2026-07-01T11:30:00.000Z',
  })

  assert.equal(result.durationMinutes, 90)
  assert.equal(result.dateEnd.toISOString(), '2026-07-01T11:30:00.000Z')
})

test('normalizePartyOrderResponsibleStaffId falls back to current staff on create', () => {
  const fallbackStaffId = '507f1f77bcf86cd799439011'

  const result = normalizePartyOrderResponsibleStaffId('', {
    fallbackStaffId,
    isValidObjectId: (value) => value === fallbackStaffId,
  })

  assert.equal(result, fallbackStaffId)
})

test('normalizePartyAdditionalEvents keeps optional responsible staff for inheritance', () => {
  const responsibleStaffId = '507f1f77bcf86cd799439012'

  const result = normalizePartyAdditionalEvents(
    [
      {
        title: 'Позвонить клиенту',
        responsibleStaffId,
      },
      {
        title: 'Проверить оплату',
        responsibleStaffId: '',
      },
    ],
    {
      isValidObjectId: (value) => value === responsibleStaffId,
    }
  )

  assert.equal(result[0].responsibleStaffId, responsibleStaffId)
  assert.equal(result[1].responsibleStaffId, null)
})
