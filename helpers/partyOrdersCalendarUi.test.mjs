import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party orders page exposes ArtistCRM-style calendar view', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const calendar = await source('components/party/orders/PartyOrdersCalendar.js')
  const dayModal = await source(
    'components/party/orders/PartyCalendarDayModal.js'
  )

  assert.match(workspace, /PartyOrdersCalendar/)
  assert.match(workspace, /orderViewMode/)
  assert.match(workspace, /setOrderViewMode/)
  assert.match(workspace, /Показать календарь/)
  assert.match(workspace, /Показать список/)
  assert.match(calendar, /event-month-calendar/)
  assert.match(calendar, /buildPartyOrderCalendarGrid/)
  assert.match(calendar, /buildPartyOrderCalendarItems/)
  assert.match(calendar, /openCalendarDay\(day, dayItems\)/)
  assert.match(calendar, /setSelectedDay\(null\)/)
  assert.match(calendar, /PartyCalendarDayModal/)
  assert.match(dayModal, /Заказы и дополнительные события/)
  assert.match(dayModal, /Открыть заказ/)
  assert.match(calendar, /Заказов: \{monthMeta\.orders\}/)
  assert.match(calendar, /Доп\. событий: \{monthMeta\.additional\}/)
})
