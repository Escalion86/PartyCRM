import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../app/company/settings/content/CompanySettingsListsContent.js', import.meta.url),
  'utf8'
)

test('company settings lists exposes order types dictionary editor', () => {
  assert.match(source, /title="Типы заказов"/)
  assert.match(source, /field="orderTypes"/)
  assert.match(source, /items=\{settings\?\.orderTypes \?\? \[\]\}/)
})

test('company settings lists exposes client lead source dictionary editor', () => {
  assert.match(source, /title="Источники заявок"/)
  assert.match(source, /field="leadSources"/)
  assert.match(source, /items=\{settings\?\.leadSources \?\? \[\]\}/)
})

test('company settings lists hides dictionaries not wired to orders or clients', () => {
  for (const field of [
    'eventTypes',
    'serviceTypes',
    'preparationStatuses',
    'paymentMethods',
    'expenseCategories',
  ]) {
    assert.doesNotMatch(source, new RegExp(`field="${field}"`))
  }
})
