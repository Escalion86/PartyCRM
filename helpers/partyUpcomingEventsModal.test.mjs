import test from 'node:test'
import assert from 'node:assert/strict'

import { collectPartyUpcomingAdditionalEvents } from './partyUpcomingEventsModal.mjs'

test('collectPartyUpcomingAdditionalEvents keeps tasks completed today visible', () => {
  const now = new Date('2026-06-09T12:00:00.000Z')
  const segments = collectPartyUpcomingAdditionalEvents(
    [
      {
        _id: 'order-1',
        additionalEvents: [
          {
            title: 'Позвонить клиенту',
            date: '2026-06-09T09:00:00.000Z',
            done: true,
            doneAt: '2026-06-09T10:00:00.000Z',
          },
          {
            title: 'Закрыто вчера',
            date: '2026-06-09T09:00:00.000Z',
            done: true,
            doneAt: '2026-06-08T10:00:00.000Z',
          },
          {
            title: 'Открытая задача',
            date: '2026-06-09T11:00:00.000Z',
            done: false,
          },
        ],
      },
    ],
    now
  )

  assert.equal(segments.today.length, 1)
  assert.equal(segments.completedToday.length, 1)
  assert.equal(segments.completedToday[0].item.title, 'Позвонить клиенту')
})
