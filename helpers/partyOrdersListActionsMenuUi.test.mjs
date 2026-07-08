import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order card actions are collapsed into dropdown menu', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /import DropDown from '@components\/DropDown'/)
  assert.match(component, /const OrderActionMenu =/)
  assert.match(component, /aria-label="Открыть меню действий заказа"/)
  assert.match(component, /<OrderActionMenu/)
  assert.match(component, /label="Редактировать"/)
  assert.match(component, /label="Удалить"/)
  assert.doesNotMatch(component, /<CardButton/)
})
