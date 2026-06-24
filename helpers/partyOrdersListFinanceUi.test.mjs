import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party orders list shows full order finance snapshot', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /getOrderPaymentState/)
  assert.match(component, /Договор:/)
  assert.match(component, /Получено:/)
  assert.match(component, /Остаток:/)
  assert.match(component, /Расходы:/)
  assert.match(component, /Выплаты:/)
  assert.match(component, /Маржа:/)
  assert.match(component, /balanceDue/)
  assert.match(component, /expenseTotal/)
  assert.match(component, /grossMargin/)
})
