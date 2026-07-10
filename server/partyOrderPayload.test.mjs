import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePartyOrderTiming } from './partyOrderPayload.js'

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

