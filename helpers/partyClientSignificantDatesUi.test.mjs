import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party client modal lets managers edit significant client dates', async () => {
  const clientModal = await source('components/party/modals/ClientModal.js')

  assert.match(clientModal, /Значимые даты/)
  assert.match(clientModal, /clientDraft\.significantDates/)
  assert.match(clientModal, /addSignificantDate/)
  assert.match(clientModal, /updateSignificantDate/)
  assert.match(clientModal, /removeSignificantDate/)
  assert.match(clientModal, /normalizeSignificantDates/)
  assert.match(clientModal, /Добавить дату/)
  assert.match(clientModal, /Удалить дату/)
})
