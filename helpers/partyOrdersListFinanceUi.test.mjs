import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party orders list mirrors ArtistCRM amount display', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /getOrderPaymentState/)
  assert.match(component, /const OrderAmountSummary =/)
  assert.match(component, /paymentState\.incomeTotal/)
  assert.match(component, /paid >= contractAmount/)
  assert.match(component, /text-green-700/)
  assert.match(component, /text-blue-700/)
  assert.match(component, /event-profit-badge/)
  assert.match(component, /event-profit-card/)
  assert.match(component, /grossMargin/)
  assert.match(component, /className="mt-3 flex flex-wrap items-end justify-between gap-2"/)
  assert.doesNotMatch(component, /className="flex shrink-0 flex-col items-end gap-2"/)
  assert.doesNotMatch(component, /Договор:/)
  assert.doesNotMatch(component, /Факт\. прибыль:/)
  assert.doesNotMatch(component, /Получено:/)
  assert.doesNotMatch(component, /Остаток:/)
  assert.doesNotMatch(component, /Расходы:/)
  assert.doesNotMatch(component, /Выплаты:/)
  assert.doesNotMatch(component, /Маржа:/)
  assert.doesNotMatch(component, /balanceDue/)
  assert.doesNotMatch(component, /expenseTotal/)
})
