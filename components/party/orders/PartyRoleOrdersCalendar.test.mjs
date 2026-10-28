import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { buildPartyRoleCalendarDays } from '../../../helpers/partyRoleCalendar.js'
import {
  buildPartyOrderCalendarPeriod,
  shiftPartyOrderCalendarPeriod,
  toPartyOrderCalendarDateKey,
} from './partyOrderCalendarViewModel.js'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const source = (
  await readFile(
    new URL('./PartyRoleOrdersCalendar.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(
    'export default function PartyRoleOrdersCalendar',
    'function PartyRoleOrdersCalendar'
  )
const compiled = transformSync(source, {
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'classic', pragma: 'h' } },
    target: 'es2022',
  },
  module: { type: 'commonjs' },
}).code
const createCalendar = new Function(
  'h',
  'useId',
  'useMemo',
  'useState',
  'FontAwesomeIcon',
  'faChevronLeft',
  'faChevronRight',
  'buildPartyRoleCalendarDays',
  'buildPartyOrderCalendarPeriod',
  'shiftPartyOrderCalendarPeriod',
  'toPartyOrderCalendarDateKey',
  'PartyRoleOrdersTimeGrid',
  `${compiled}\nreturn PartyRoleOrdersCalendar`
)

const nodes = function* (node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* nodes(child)
    return
  }
  if (!node || typeof node !== 'object') return
  yield node
  yield* nodes(node.props?.children)
}

// Render real JSX as an element tree and invoke its actual event handlers. No
// DOM/browser imitation or duplicate view-switching logic is involved.
const calendarHost = () => {
  let selected = '',
    cursor = new Date(2026, 9, 28),
    view = 'month'
  const dateChanges = [],
    viewChanges = []
  const TimeGrid = () => null
  const Calendar = createCalendar(
    (type, props, ...children) => ({ type, props: { ...props, children } }),
    () => 'calendar-id',
    (calculate) => calculate(),
    () => [
      selected,
      (value) => {
        selected = value
      },
    ],
    () => null,
    'left',
    'right',
    buildPartyRoleCalendarDays,
    buildPartyOrderCalendarPeriod,
    shiftPartyOrderCalendarPeriod,
    toPartyOrderCalendarDateKey,
    TimeGrid
  )
  const render = () =>
    Calendar({
      orders: [],
      month: cursor,
      view,
      access: {},
      onOpen() {},
      onMonthChange: (date) => {
        cursor = date
        dateChanges.push(date)
      },
      onViewChange: (next) => {
        view = next
        viewChanges.push(next)
      },
    })
  return {
    dateChanges,
    viewChanges,
    find(predicate) {
      const result = [...nodes(render())].find(predicate)
      assert.ok(result, 'Expected calendar element')
      return result
    },
    get period() {
      return this.find((node) => node.type === TimeGrid).props.days
    },
    get cursor() {
      return cursor
    },
  }
}

for (const view of ['day', 'week'])
  test(`month selection anchors ${view} to the selected date, rather than the old cursor`, () => {
    const host = calendarHost()
    const selectedDate = new Date(2026, 9, 10)
    host
      .find(
        (node) =>
          node.type === 'button' &&
          node.props['aria-label'] ===
            `${selectedDate.toLocaleDateString('ru-RU')}, заказов: 0`
      )
      .props.onClick()
    assert.equal(
      host.dateChanges.length,
      0,
      'Selecting a date must not navigate the month'
    )
    assert.equal(+host.cursor, +new Date(2026, 9, 28))
    assert.equal(
      host.find(
        (node) =>
          node.type === 'button' &&
          node.props['aria-pressed'] === true &&
          node.props['aria-label']?.includes('заказов')
      ).props['aria-label'],
      `${selectedDate.toLocaleDateString('ru-RU')}, заказов: 0`
    )
    host
      .find(
        (node) =>
          node.type === 'button' &&
          node.props.children.includes(view === 'day' ? 'День' : 'Неделя')
      )
      .props.onClick()
    assert.deepEqual(host.viewChanges, [view])
    assert.equal(+host.dateChanges[0], +selectedDate)
    assert.deepEqual(
      host.period.map((day) => day.key),
      view === 'day'
        ? ['2026-10-10']
        : [
            '2026-10-05',
            '2026-10-06',
            '2026-10-07',
            '2026-10-08',
            '2026-10-09',
            '2026-10-10',
            '2026-10-11',
          ]
    )
  })

test('selecting an adjacent month cell only navigates after explicitly choosing a detailed view', () => {
  const host = calendarHost()
  const adjacent = new Date(2026, 8, 27)
  host
    .find(
      (node) =>
        node.type === 'button' &&
        node.props['aria-label'] ===
          `${adjacent.toLocaleDateString('ru-RU')}, заказов: 0`
    )
    .props.onClick()
  assert.deepEqual(host.dateChanges, [])
  host
    .find(
      (node) => node.type === 'button' && node.props.children.includes('День')
    )
    .props.onClick()
  assert.equal(+host.cursor, +adjacent)
  assert.deepEqual(
    host.period.map((day) => day.key),
    ['2026-09-27']
  )
})
