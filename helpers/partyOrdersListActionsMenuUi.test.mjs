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

test('party order card shows nearest additional event instead of task counters', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /const getNearestAdditionalEventInfo =/)
  assert.match(component, /nearestAdditionalEventInfo/)
  assert.match(component, /\+{hiddenAdditionalCount}/)
  assert.doesNotMatch(component, /Сегодня: \{additionalEventsBadges\.today\}/)
  assert.doesNotMatch(component, /Задачи: \{additionalEventsBadges\.open\}/)
})

test('party order action menu opens additional events modal', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /faCalendarAlt/)
  assert.match(component, /onAdditionalEvents/)
  assert.match(component, /label="Доп\. события"/)
})

test('party order cards show assignment confirmation statuses', async () => {
  const component = await source('components/party/lists/OrdersList.js')

  assert.match(component, /ASSIGNMENT_STATUS_META/)
  assert.match(component, /getAssignmentSummaryBadge/)
  assert.match(component, /OrderAssignmentsSummary/)
  assert.match(component, /Все подтвердили/)
  assert.match(component, /Подтвердил/)
  assert.match(component, /Ждет/)
  assert.match(component, /Отказ/)
  assert.match(component, /Выполнено/)
  assert.match(component, /Без исполнителя/)
})
