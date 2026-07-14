import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getFormSnapshot } from './useUnsavedChanges.js'

test('form snapshot is stable for objects with different key order', () => {
  assert.equal(
    getFormSnapshot({
      title: 'Заказ',
      nested: { amount: 100, status: 'draft' },
    }),
    getFormSnapshot({
      nested: { status: 'draft', amount: 100 },
      title: 'Заказ',
    })
  )
})

test('PartyCRM editing modals enable unsaved changes protection', async () => {
  const files = await Promise.all(
    [
      '../components/party/modals/OrderModal.js',
      '../components/party/modals/ClientModal.js',
      '../components/party/modals/LocationModal.js',
      '../components/party/modals/StaffModal.js',
      '../components/party/modals/ServiceModal.js',
      '../components/party/modals/OrderAdditionalEventsModal.js',
      '../components/party/orders/PartyOrderTransactionsSection.js',
      '../components/party/lists/OrdersList.js',
    ].map((file) => readFile(new URL(file, import.meta.url), 'utf8'))
  )

  for (const source of files) {
    assert.match(source, /hasUnsavedChanges=/)
    assert.match(source, /requestClose/)
  }
})

test('shared modal guards backdrop, cross, Escape and footer close actions', async () => {
  const source = await readFile(
    new URL('../components/Modal.js', import.meta.url),
    'utf8'
  )

  assert.match(source, /handleBackdropClick/)
  assert.match(source, /e\.key === 'Escape'/)
  assert.match(source, /onClick=\{requestClose\}/)
  assert.match(source, /footer\(\{ requestClose \}\)/)
  assert.match(source, /Закрыть без сохранения/)
})
