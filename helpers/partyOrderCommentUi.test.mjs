import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order editor exposes admin comment in the main tab', async () => {
  const modal = await source('components/party/modals/OrderModal.js')
  const helpers = await source('helpers/partyHelpers.js')

  assert.match(helpers, /adminComment:\s*''/)
  assert.match(modal, /label="Комментарий"/)
  assert.match(modal, /value=\{orderDraft\.adminComment \|\| ''\}/)
  assert.match(modal, /handleChange\('adminComment', val\)/)
})

test('party orders list shows filled admin comment', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /order\.adminComment/)
  assert.match(component, /Комментарий:/)
  assert.match(component, /\{order\.adminComment\}/)
})
