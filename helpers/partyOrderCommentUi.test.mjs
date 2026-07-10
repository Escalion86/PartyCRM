import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order editor exposes admin comment in the main tab', async () => {
  const modal = await source('components/party/modals/OrderModal.js')
  const helpers = await source('helpers/partyHelpers.js')
  const schema = await source('schemas/partyOrdersSchema.js')
  const route = await source('app/api/party/orders/route.js')

  assert.match(helpers, /adminComment:\s*''/)
  assert.match(modal, /label="Комментарий для администратора"/)
  assert.match(modal, /value=\{orderDraft\.adminComment \|\| ''\}/)
  assert.match(modal, /handleChange\('adminComment', val\)/)
  assert.match(helpers, /performerComment:\s*''/)
  assert.match(schema, /performerComment/)
  assert.match(route, /performerComment/)
  assert.match(modal, /label="Комментарий для исполнителя"/)
  assert.match(modal, /value=\{orderDraft\.performerComment \|\| ''\}/)
  assert.match(modal, /handleChange\('performerComment', val\)/)
})

test('party orders list truncates overflowing admin comment and shows tooltip trigger', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /const OrderCommentPreview =/)
  assert.match(component, /order\.adminComment/)
  assert.match(component, /Комментарий:/)
  assert.match(
    component,
    /className="mt-1 grid max-w-full min-w-0 grid-cols-\[auto_minmax\(0,1fr\)_auto\]/
  )
  assert.match(component, /className="block min-w-0 truncate"/)
  assert.match(component, /scrollWidth > textElement\.clientWidth/)
  assert.match(component, /aria-label="Показать полный комментарий"/)
  assert.match(component, /createPortal\(/)
  assert.match(component, /position:\s*'fixed'/)
  assert.match(component, /tooltipPosition/)
  assert.match(component, /role="tooltip"/)
  assert.match(component, /whitespace-pre-wrap/)
  assert.match(component, /break-words/)
})
