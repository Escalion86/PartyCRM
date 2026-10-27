import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPartyRoleCalendarDays, getPartyRoleCalendarRange, projectPartyRoleCalendarOrder } from './partyRoleCalendar.js'
import { buildPartyOrderCalendarGrid } from '../components/party/orders/partyOrderCalendarViewModel.js'

test('calendar projection never reveals hidden title, client, status or end date', () => {
  const raw = { _id: 'order', eventDate: '2026-10-27T10:00:00Z', title: 'Скрытое название', serviceTitle: 'Скрытая услуга', client: { name: 'Скрытый клиент', phone: '79130000000' }, dateEnd: '2026-10-30T10:00:00Z', status: 'closed', contractAmount: 987654 }
  const safe = projectPartyRoleCalendarOrder(raw)
  assert.equal(safe.title, 'Заказ')
  assert.equal(safe.clientName, '')
  assert.equal(safe.status, '')
  assert.equal(safe.end, null)
  assert.equal(JSON.stringify(safe).includes('Скрыт'), false)
  assert.equal(JSON.stringify(safe).includes('987654'), false)
  assert.equal(projectPartyRoleCalendarOrder({ ...raw, eventDate: null }), null)
})

test('multi-day calendar uses only authorized end date and excludes midnight boundary', () => {
  const days = buildPartyOrderCalendarGrid(new Date(2026, 9, 1))
  const raw = { _id: 'order', title: 'Праздник', eventDate: new Date(2026, 8, 25, 10).toISOString(), dateEnd: new Date(2026, 9, 3, 0).toISOString() }
  const visible = buildPartyRoleCalendarDays([raw], days, { title: true, end: true })
  assert.equal(visible.get('2026-10-01').length, 1)
  assert.equal(visible.get('2026-10-02').length, 1)
  assert.equal(visible.get('2026-10-03').length, 0)
  const hidden = buildPartyRoleCalendarDays([raw], days, { title: true })
  assert.equal([...hidden.values()].flat().length, 0)
})

test('calendar query range includes all visible grid days with an exclusive end', () => {
  const days = buildPartyOrderCalendarGrid(new Date(2026, 9, 1))
  const range = getPartyRoleCalendarRange(days)
  assert.equal(+new Date(range.dateFrom), +days[0].date)
  const end = new Date(days.at(-1).date)
  end.setDate(end.getDate() + 1)
  assert.equal(+new Date(range.dateTo), +end)
  assert.equal(+new Date(range.dateTo) > +new Date(range.dateFrom), true)
  assert.equal((+new Date(range.dateTo) - +new Date(range.dateFrom)) / 86400000 < 50, true)
})
