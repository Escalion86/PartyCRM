import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { canPartyAccess } from '../../../helpers/partyRolePermissions.js'
import {
  getPartyOrderBoardTransitions,
  projectPartyOrderBoardColumns,
} from '../../../helpers/partyOrderBoard.js'
import { getPartyOrderStage } from '../../../helpers/partyWorkflow.js'
import { createHookHost, nodes, textOf } from './partyOrderBoardTestHost.mjs'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const source = (
  await readFile(new URL('./PartyRoleOrdersBoard.js', import.meta.url), 'utf8')
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(
    'export default function PartyRoleOrdersBoard',
    'function PartyRoleOrdersBoard'
  )
const compiled = transformSync(source, {
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'classic', pragma: 'h' } },
    target: 'es2022',
  },
  module: { type: 'commonjs' },
}).code
const createBoard = (h, hooks) => {
  const bindings = {
    React,
    ...hooks,
    canPartyAccess,
    getPartyOrderBoardTransitions,
    projectPartyOrderBoardColumns,
    getPartyOrderStage,
    FontAwesomeIcon: () => null,
    faEllipsis: 'ellipsis',
    faLocationDot: 'location',
    faUser: 'user',
    Menu: ({ open, children, slotProps }) =>
      open ? h('div', { role: 'menu', ...slotProps.list }, children) : null,
    MenuItem: ({ children, onClick }) =>
      h('button', { role: 'menuitem', onClick }, children),
  }
  return new Function(
    'h',
    ...Object.keys(bindings),
    `${compiled}\nreturn PartyRoleOrdersBoard`
  )(h, ...Object.values(bindings))
}
const tenantId = 'a'.repeat(24),
  roleId = 'b'.repeat(24),
  staffId = 'c'.repeat(24)
const context = (grants = {}) => ({
  tenantId,
  role: 'performer',
  staff: {
    _id: staffId,
    tenantId,
    role: 'performer',
    positionId: roleId,
    status: 'active',
  },
  position: {
    _id: roleId,
    tenantId,
    active: true,
    permissions: {
      orders: 'read',
      'orders.workflowStageId': 'read',
      'orders.transition': 'edit',
      'orders.title': 'read',
      ...grants,
    },
  },
})
const workflow = {
  initialStageId: 'new',
  stages: [
    { id: 'new', title: 'Новые' },
    { id: 'prepare', title: 'Подготовка' },
  ],
  transitions: [{ fromStageId: 'new', toStageId: 'prepare', roleIds: [] }],
}
const order = {
  _id: 'd'.repeat(24),
  workflowStageId: 'new',
  updatedAt: '2026-10-29T10:00:00Z',
  status: 'active',
  title: 'Заказ',
  client: { name: 'Скрытый клиент' },
  contractAmount: 987654,
  eventDate: '2026-10-30T12:00:00Z',
}
const props = (extra = {}) => ({
  context: context(),
  workflow,
  stages: workflow.stages,
  board: {
    columns: {
      new: { orders: [order], busy: false, nextCursor: null },
      prepare: { orders: [], busy: false },
    },
    busy: false,
    reload() {},
    loadMore() {},
  },
  onOpen() {},
  onTransition() {},
  ...extra,
})
const SSRBoard = createBoard(React.createElement, {
  useId: React.useId,
  useMemo: React.useMemo,
  useState: React.useState,
})

test('board SSR shows only explicitly permitted order fields and accessible alternatives', () => {
  const html = renderToStaticMarkup(React.createElement(SSRBoard, props()))
  assert.match(html, /Заказ/)
  assert.match(html, /Переместить заказ/)
  assert.match(html, /aria-haspopup="menu"/)
  assert.doesNotMatch(html, /Скрытый клиент|987654|<time|Подтверждён/)
  assert.match(html, /class="sr-only">Загружено заказов: 1<\/span><span aria-hidden="true">1<\/span>/)
  assert.match(html, /min-h-11/)
})

test('read-only stage cards have no drag handle or move menu', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      SSRBoard,
      props({ context: context({ 'orders.transition': 'hidden' }) })
    )
  )
  assert.doesNotMatch(html, /draggable|aria-haspopup="menu"/)
  assert.match(html, /Открыть заказ/)
  assert.match(html, /Листайте колонки/)
})

test('hidden-status cards expose controls only with an explicit server capability', () => {
  const hidden = { ...order }
  delete hidden.status
  for (const [capability, movable] of [
    [true, true],
    [false, false],
    [undefined, false],
  ]) {
    const dto = {
      ...hidden,
      ...(capability === undefined
        ? {}
        : { workflowTransitionAvailable: capability }),
    }
    const html = renderToStaticMarkup(
      React.createElement(
        SSRBoard,
        props({
          board: {
            columns: {
              new: { orders: [dto], busy: false },
              prepare: { orders: [], busy: false },
            },
            busy: false,
            reload() {},
            loadMore() {},
          },
        })
      )
    )
    assert.equal(html.includes('draggable="true"'), movable)
    assert.equal(html.includes('aria-haspopup="menu"'), movable)
    assert.doesNotMatch(html, /Подтверждён|Закрыт|workflowTransitionAvailable/)
  }
})

test('failed stage and sparse continuation are distinguished from an empty result', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      SSRBoard,
      props({
        board: {
          columns: {
            new: { orders: [], busy: false, error: 'Ошибка сервера' },
            prepare: { orders: [], busy: false, nextCursor: 'a'.repeat(24) },
          },
          reload() {},
        },
      })
    )
  )
  assert.match(html, /Ошибка сервера/)
  assert.match(html, /Не загружено/)
  assert.match(html, /Совпадений пока нет/)
  assert.match(html, /Продолжить поиск/)
  assert.match(html, /Загружено заказов: 0\. Можно загрузить ещё\.<\/span><span aria-hidden="true">0\+<\/span>/)
  assert.doesNotMatch(html, /На этом этапе пока нет заказов|По этим условиям заказов нет/)
})

test('empty columns suggest resetting filters only when filters are active', () => {
  const unfiltered = renderToStaticMarkup(React.createElement(SSRBoard, props()))
  const filtered = renderToStaticMarkup(React.createElement(SSRBoard, props({ filtered: true })))

  assert.match(unfiltered, /На этом этапе пока нет заказов/)
  assert.doesNotMatch(unfiltered, /Сбросьте фильтры/)
  assert.match(filtered, /По этим условиям заказов нет\. Сбросьте фильтры/)
  assert.doesNotMatch(filtered, /На этом этапе пока нет заказов/)
})

test('move menu and actual drag/drop handlers invoke the same transition callback', () => {
  const transitions = [],
    opened = []
  const h = (type, values, ...children) =>
    typeof type === 'function'
      ? type({ ...values, children })
      : { type, props: { ...values, children } }
  const host = createHookHost(
    (hooks) => createBoard(h, hooks),
    props({
      onTransition: (...args) => transitions.push(args),
      onOpen: (value) => opened.push(value),
    })
  )
  const find = (predicate) => [...nodes(host.value)].find(predicate)
  const findMoveButton = () => find(
    (node) => node.props?.['aria-label'] === 'Переместить заказ «Заказ»'
  )
  const moveButton = findMoveButton()
  assert.equal(moveButton.props['aria-expanded'], false)
  moveButton.props.onClick({ currentTarget: moveButton })
  const menu = find((node) => node.props?.role === 'menu')
  assert.equal(findMoveButton().props['aria-expanded'], true)
  assert.equal(menu.props.id, findMoveButton().props['aria-controls'])
  const destination = find((node) =>
    node.props?.role === 'menuitem' && textOf(node) === 'Подготовка'
  )
  destination.props.onClick()
  assert.deepEqual(transitions, [[order, 'prepare']])
  assert.equal(findMoveButton().props['aria-expanded'], false)
  const openButton = find(
    (node) => node.props?.['aria-label'] === 'Открыть заказ «Заказ»'
  )
  openButton.props.onClick()
  assert.deepEqual(opened, [order])
  const data = new Map()
  const dataTransfer = {
    setData: (key, value) => data.set(key, value),
    getData: (key) => data.get(key),
  }
  const handle = findMoveButton()
  assert.equal(handle.props.draggable, true)
  handle.props.onDragStart({ dataTransfer })
  const target = find(
    (node) =>
      node.type === 'section' &&
      node.props?.['aria-labelledby']?.endsWith('-prepare')
  )
  target.props.onDrop({ dataTransfer, preventDefault() {} })
  assert.deepEqual(transitions, [
    [order, 'prepare'],
    [order, 'prepare'],
  ])
})
