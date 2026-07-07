import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party notification settings expose additional event reminder days before', async () => {
  const content = await source(
    'app/company/settings/content/CompanySettingsNotificationsContent.js'
  )

  assert.match(content, /additionalEventsReminderDaysBefore/)
  assert.match(content, /reminderDaysBefore/)
  assert.match(content, /За сколько дней до даты напоминать/)
  assert.match(content, /min="0"/)
  assert.match(content, /max="30"/)
})
