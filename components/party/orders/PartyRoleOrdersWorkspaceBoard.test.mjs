import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  canPartyAccess,
  isPartyRestrictedManagementContext,
} from '../../../helpers/partyRolePermissions.js'
import * as workflowHelpers from '../../../helpers/partyWorkflow.js'
import * as boardHelpers from '../../../helpers/partyOrderBoard.js'
import { createHookHost, nodes, textOf } from './partyOrderBoardTestHost.mjs'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const source = (
  await readFile(
    new URL('./PartyRoleOrdersWorkspace.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(
    'export default function PartyRoleOrdersWorkspace',
    'function PartyRoleOrdersWorkspace'
  )
const compiled = transformSync(source, {
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'classic', pragma: 'h' } },
    target: 'es2022',
  },
  module: { type: 'commonjs' },
}).code
const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  roleId = 'c'.repeat(24),
  orderId = 'd'.repeat(24)
const workflow = {
  initialStageId: 'new',
  stages: [
    { id: 'new', title: 'Новая' },
    { id: 'prepare', title: 'Подготовка' },
  ],
  transitions: [
    {
      fromStageId: 'new',
      toStageId: 'prepare',
      roleIds: [],
      requireBrief: true,
    },
  ],
}
const context = (permissions = {}) => ({
  tenantId,
  role: 'performer',
  staff: {
    _id: staffId,
    tenantId,
    role: 'performer',
    status: 'active',
    positionId: roleId,
  },
  position: {
    _id: roleId,
    tenantId,
    active: true,
    permissions: {
      orders: 'read',
      'orders.title': 'read',
      'orders.workflowStageId': 'read',
      'orders.transition': 'edit',
      ...permissions,
    },
  },
  company: { settings: { workflow } },
})
const record = {
  _id: orderId,
  tenantId,
  title: 'Заказ',
  status: 'active',
  workflowStageId: 'new',
  updatedAt: '2026-10-29T10:00:00Z',
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const setup = ({
  permissions = {},
  api,
  initialOrderId = '',
  href = 'http://test/company/work',
  savedView = 'board',
} = {}) => {
  const calls = [],
    pending = [],
    boardCalls = [],
    left = [],
    replaced = []
  const document = { activeElement: {}, body: {}, getElementById: () => null }
  const window = {
    location: { href, pathname: '/company/work', assign() {} },
    addEventListener() {},
    removeEventListener() {},
    history: {
      state: { next: 'preserved' },
      replaceState: (state, _, url) => {
        replaced.push({ state, url: String(url) })
        window.location.href = String(url)
      },
    },
  }
  const host = createHookHost(
    (hooks) => {
      const bindings = {
        ...hooks,
        ...workflowHelpers,
        ...boardHelpers,
        canPartyAccess,
        isPartyRestrictedManagementContext,
        h: (type, values, ...children) => ({
          type,
          props: { ...values, children },
        }),
        React: { Fragment: 'fragment' },
        dynamic: (load) => {
          const component = () => null
          component.displayName = load
            .toString()
            .includes('PartyRoleOrdersBoard')
            ? 'Board'
            : 'Dynamic'
          return component
        },
        apiJson: async (url, options = {}) => {
          calls.push({ url, options })
          const custom = await api?.(url, options)
          if (custom !== undefined) return custom
          if (url.startsWith('/api/party/order-options'))
            return {
              data: {
                context: context(permissions),
                clients: [],
                staff: [],
                services: [],
                locations: [],
              },
            }
          if (url === '/api/party/workflow') return { data: workflow }
          if (url === `/api/party/orders/${orderId}`) return { data: record }
          throw new Error(`Unexpected API ${url}`)
        },
        usePartyUnsavedChanges: (_dirty, options) => pending.push(options),
        requestPartyLeave: (options) => {
          left.push(options)
          return true
        },
        usePartyOrderList: () => ({
          orders: [],
          busy: false,
          nextCursor: null,
        }),
        usePartyOrderCalendar: () => ({ orders: [], busy: false }),
        usePartyOrderBoard: (options) => {
          boardCalls.push(options)
          return { columns: {}, busy: false, reload() {}, loadMore() {} }
        },
        readPartyOrderViewPreference: () => ({
          view: savedView,
          calendarView: 'month',
        }),
        writePartyOrderViewPreference() {},
        requestAnimationFrame: (run) => {
          run()
          return 1
        },
        document,
        window,
      }
      return new Function(
        ...Object.keys(bindings),
        `${compiled}\nreturn CompanyRoleOrders`
      )(...Object.values(bindings))
    },
    {
      companyId: tenantId,
      initialOrderId,
      legacyAdvancedPath: '/company/orders',
    }
  )
  host.render()
  return { host, calls, pending, boardCalls, left, replaced }
}
const boardNode = (host) =>
  [...nodes(host.value)].find((node) => node.type?.displayName === 'Board')
const button = (host, text) =>
  [...nodes(host.value)].find(
    (node) => node.type === 'button' && textOf(node) === text
  )

test('saved board is available only with the stage field grant and never requests hidden columns', async () => {
  const visible = setup()
  await visible.host.flush()
  assert.ok(button(visible.host, 'Доска'))
  assert.deepEqual(visible.boardCalls.at(-1).stageIds, ['new', 'prepare'])
  assert.equal(visible.boardCalls.at(-1).enabled, true)
  const hidden = setup({ permissions: { 'orders.workflowStageId': 'hidden' } })
  await hidden.host.flush()
  assert.equal(button(hidden.host, 'Доска'), undefined)
  assert.equal(boardNode(hidden.host), undefined)
  assert.equal(hidden.boardCalls.at(-1).enabled, false)
  assert.deepEqual(hidden.boardCalls.at(-1).stageIds, [])
})

test('board move sends only canonical stage and expected revision and blocks actions/navigation while pending', async () => {
  const gate = deferred()
  const run = setup({
    api: (url) => (url.endsWith('/stage') ? gate.promise : undefined),
  })
  await run.host.flush()
  const move = boardNode(run.host).props.onTransition(record, 'prepare')
  run.host.render()
  const request = run.calls.find((call) => call.url.endsWith('/stage'))
  assert.equal(request.options.method, 'PATCH')
  assert.deepEqual(JSON.parse(request.options.body), {
    toStageId: 'prepare',
    expectedUpdatedAt: '2026-10-29T10:00:00.000Z',
  })
  assert.equal(request.options.headers['x-partycrm-company-id'], tenantId)
  assert.equal(boardNode(run.host).props.disabled, true)
  assert.equal(button(run.host, 'Обновить').props.disabled, true)
  assert.equal(button(run.host, 'Список').props.disabled, true)
  assert.ok(
    run.pending.some(
      (entry) => entry.label === 'передача заказа' && entry.pending
    )
  )
  gate.resolve({
    data: {
      ...record,
      workflowStageId: 'prepare',
      updatedAt: '2026-10-29T11:00:00Z',
    },
  })
  await move
  await run.host.flush()
  assert.match(textOf(run.host.value), /Рабочий этап заказа изменён/)
  assert.equal(boardNode(run.host).props.disabled, false)
  assert.equal(run.boardCalls.at(-1).refreshKey, 1)
})

test('out-of-scope handoff shows confirmation without retaining a replacement order', async () => {
  const run = setup({
    api: (url) =>
      url.endsWith('/stage') ? { data: null, accessChanged: true } : undefined,
  })
  await run.host.flush()
  await boardNode(run.host).props.onTransition(record, 'prepare')
  await run.host.flush()
  assert.match(
    textOf(run.host.value),
    /На новом этапе он доступен другим сотрудникам/
  )
  assert.equal(
    [...nodes(run.host.value)].some(
      (node) => node.type?.name === 'RoleOrderEditor'
    ),
    false
  )
})

test('required brief failure offers the existing contextual order editor without changing stage', async () => {
  const run = setup({
    api: (url) => {
      if (url.endsWith('/stage'))
        throw Object.assign(new Error('Заполните обязательные вопросы брифа'), {
          status: 409,
          payload: { error: { code: 'partycrm_brief_required' } },
        })
    },
  })
  await run.host.flush()
  await boardNode(run.host).props.onTransition(record, 'prepare')
  await run.host.flush()
  const help = button(run.host, 'Открыть заказ и заполнить бриф')
  assert.ok(help)
  assert.match(textOf(run.host.value), /Заполните обязательные вопросы брифа/)
  await help.props.onClick()
  await run.host.flush()
  const editor = [...nodes(run.host.value)].find(
    (node) => node.type?.name === 'RoleOrderEditor'
  )
  assert.equal(editor.props.order.workflowStageId, 'new')
  assert.ok(
    run.calls.some(
      (call) => call.url === `/api/party/order-options?orderId=${orderId}`
    )
  )
})

test('dirty editor is preserved while changing view and prevents board moves', async () => {
  const run = setup()
  await run.host.flush()
  await boardNode(run.host).props.onOpen(record)
  await run.host.flush()
  let editor = [...nodes(run.host.value)].find(
    (node) => node.type?.name === 'RoleOrderEditor'
  )
  editor.props.onDirtyChange(true)
  run.host.render()
  button(run.host, 'Список').props.onClick()
  run.host.render()
  button(run.host, 'Доска').props.onClick()
  run.host.render()
  editor = [...nodes(run.host.value)].find(
    (node) => node.type?.name === 'RoleOrderEditor'
  )
  assert.equal(editor.props.order._id, orderId)
  assert.equal(boardNode(run.host).props.disabled, true)
  await boardNode(run.host).props.onTransition(record, 'prepare')
  assert.equal(
    run.calls.some((call) => call.url.endsWith('/stage')),
    false
  )
})

test('deep link opens the canonical order and contextual options in the requested company', async () => {
  const run = setup({
    initialOrderId: orderId,
    href: `http://test/company/work?companyId=${tenantId}&orderId=${orderId}`,
  })
  await run.host.flush()
  assert.equal(
    run.calls.filter((call) => call.url === `/api/party/orders/${orderId}`)
      .length,
    1
  )
  assert.ok(
    run.calls.some(
      (call) => call.url === `/api/party/order-options?orderId=${orderId}`
    )
  )
  assert.ok(
    run.calls.every(
      (call) => call.options.headers['x-partycrm-company-id'] === tenantId
    )
  )
  assert.ok(
    run.left.some(
      (entry) => entry.kind === 'record' && entry.target === orderId
    )
  )
  assert.equal(run.replaced.length, 1)
  assert.deepEqual(run.replaced[0].state, { next: 'preserved' })
  assert.equal(new URL(run.replaced[0].url).searchParams.has('orderId'), false)
  const editor = [...nodes(run.host.value)].find(
    (node) => node.type?.name === 'RoleOrderEditor'
  )
  assert.equal(editor.props.order._id, orderId)
})

test('inaccessible deep-linked order never becomes a fallback selected record', async () => {
  const run = setup({
    initialOrderId: orderId,
    api: (url) => {
      if (url === `/api/party/orders/${orderId}`)
        throw Object.assign(new Error('Заказ не найден'), { status: 404 })
    },
  })
  await run.host.flush()
  assert.match(textOf(run.host.value), /Заказ не найден/)
  assert.equal(
    [...nodes(run.host.value)].some(
      (node) => node.type?.name === 'RoleOrderEditor'
    ),
    false
  )
})
