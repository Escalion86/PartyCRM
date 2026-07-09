import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./PartyGoogleCalendarSettings.js', import.meta.url),
  'utf8'
)

test('Party Google Calendar settings expose ArtistCRM-style status palette without transferred skip option', () => {
  assert.match(source, /Не синхронизировать с календарем, если отменено/)
  assert.doesNotMatch(source, /Не синхронизировать с календарем, если передано/)
  assert.match(source, /STATUS_COLOR_OPTIONS/)
  assert.match(source, /backgroundColor: selectedColor\.bg/)
  assert.match(source, /deleteCanceledFromCalendar && field\.key === 'canceled'/)
})
