import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party client modal lets managers edit significant client dates', async () => {
  const clientModal = await source('components/party/modals/ClientModal.js')
  const clientsList = await source('components/party/lists/ClientsList.js')
  const schema = await source('schemas/partyClientsSchema.js')
  const createRoute = await source('app/api/party/clients/route.js')
  const updateRoute = await source('app/api/party/clients/[id]/route.js')

  assert.match(clientModal, /Значимые даты/)
  assert.match(clientModal, /clientDraft\.significantDates/)
  assert.match(clientModal, /addSignificantDate/)
  assert.match(clientModal, /updateSignificantDate/)
  assert.match(clientModal, /removeSignificantDate/)
  assert.match(clientModal, /normalizeSignificantDates/)
  assert.match(clientModal, /Добавить дату/)
  assert.match(clientModal, /Удалить дату/)
  assert.match(clientModal, /isLegalEntity/)
  assert.match(clientModal, /Юр\. лицо/)
  assert.match(clientModal, /Реквизиты/)
  assert.match(clientModal, /\{isLegalEntity && \(/)
  assert.match(clientModal, /label: 'MAX'/)
  assert.match(clientModal, /Откуда узнал о компании/)
  assert.match(clientModal, /handleChange\('leadSource'\)/)
  assert.match(clientsList, /client\.leadSource/)
  assert.match(clientsList, /Откуда узнал о компании:/)
  assert.match(schema, /leadSource/)
  assert.match(createRoute, /leadSource: normalizeString\(body\.leadSource\)/)
  assert.match(updateRoute, /patch\.leadSource = normalizeString\(body\.leadSource\)/)
  assert.match(clientModal, /town: false/)
  assert.doesNotMatch(clientModal, /title="Адрес"/)
})
