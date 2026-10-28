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
import { nodes } from './partyOrderBoardTestHost.mjs'

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
const createBoard = (h, hooks) =>
  new Function(
    'h',
    ...Object.keys(hooks),
    'canPartyAccess',
    'getPartyOrderBoardTransitions',
    'projectPartyOrderBoardColumns',
    'getPartyOrderStage',
    `${compiled}\nreturn PartyRoleOrdersBoard`
  )(
    h,
    ...Object.values(hooks),
    canPartyAccess,
    getPartyOrderBoardTransitions,
    projectPartyOrderBoardColumns,
    getPartyOrderStage
  )
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
  assert.match(html, /Передать заказ/)
  assert.match(html, /Перетащить заказ/)
  assert.doesNotMatch(html, /Скрытый клиент|987654|30 окт|Подтверждён/)
  assert.match(html, /Загружено 1/)
  assert.match(html, /min-h-11/)
})

test('read-only stage cards have no drag handle or transition select', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      SSRBoard,
      props({ context: context({ 'orders.transition': 'hidden' }) })
    )
  )
  assert.doesNotMatch(html, /draggable|<select/)
  assert.match(html, /Открыть заказ/)
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
    assert.equal(html.includes('<select'), movable)
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
  assert.doesNotMatch(html, /Заказов по выбранным условиям нет/)
})

test('ordinary selection and actual drag/drop handlers invoke the same transition callback', () => {
  let dragged = null
  const transitions = [],
    opened = []
  const h = (type, values, ...children) =>
    typeof type === 'function'
      ? type({ ...values, children })
      : { type, props: { ...values, children } }
  const Board = createBoard(h, {
    useId: () => 'board',
    useMemo: (fn) => fn(),
    useState: () => [
      dragged,
      (value) => {
        dragged = value
      },
    ],
  })
  const render = () =>
    Board(
      props({
        onTransition: (...args) => transitions.push(args),
        onOpen: (value) => opened.push(value),
      })
    )
  let tree = render()
  const select = [...nodes(tree)].find((node) => node.type === 'select')
  select.props.onChange({ target: { value: 'prepare' } })
  assert.deepEqual(transitions, [[order, 'prepare']])
  const openButton = [...nodes(tree)].find(
    (node) => node.props?.['aria-label'] === 'Открыть заказ «Заказ»'
  )
  openButton.props.onClick()
  assert.deepEqual(opened, [order])
  const data = new Map()
  const dataTransfer = {
    setData: (key, value) => data.set(key, value),
    getData: (key) => data.get(key),
  }
  const handle = [...nodes(tree)].find((node) => node.props?.draggable)
  handle.props.onDragStart({ dataTransfer })
  tree = render()
  const target = [...nodes(tree)].find(
    (node) =>
      node.type === 'section' &&
      node.props?.['aria-labelledby'] === 'board-prepare'
  )
  target.props.onDrop({ dataTransfer, preventDefault() {} })
  assert.deepEqual(transitions, [
    [order, 'prepare'],
    [order, 'prepare'],
  ])
})
