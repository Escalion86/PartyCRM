import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPartyPerformerCalendarIcs } from './partyPerformerCalendar.js'

test('buildPartyPerformerCalendarIcs exports performer assignments without finance or internal notes', () => {
  const ics = buildPartyPerformerCalendarIcs({
    orders: [
      {
        _id: 'order-1',
        staffId: 'staff-1',
        companyTitle: 'Компания',
        title: 'Детский праздник',
        serviceTitle: 'Анимация',
        eventDate: '2026-07-01T10:00:00.000Z',
        dateEnd: '2026-07-01T12:00:00.000Z',
        placeType: 'client_address',
        customAddress: 'Москва, Тверская 1',
        client: {
          name: 'Иван Клиент',
          phone: '79990000000',
        },
        assignment: {
          payoutAmount: 5000,
          confirmationStatus: 'confirmed',
        },
        contractAmount: 30000,
        adminComment: 'Внутренняя заметка',
        internalNotes: 'Не показывать исполнителю',
      },
    ],
    now: new Date('2026-06-23T00:00:00.000Z'),
  })

  assert.match(ics, /BEGIN:VCALENDAR/)
  assert.match(ics, /BEGIN:VEVENT/)
  assert.match(ics, /SUMMARY:Компания - Детский праздник/)
  assert.match(ics, /LOCATION:Москва\\, Тверская 1/)
  assert.match(ics, /DTSTART:20260701T100000Z/)
  assert.match(ics, /DTEND:20260701T120000Z/)
  assert.doesNotMatch(ics, /30000/)
  assert.doesNotMatch(ics, /5000/)
  assert.doesNotMatch(ics, /79990000000/)
  assert.doesNotMatch(ics, /Внутренняя заметка/)
  assert.doesNotMatch(ics, /Не показывать исполнителю/)
})
