import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as taskHelpers from '../../../helpers/partyTasks.js'
import * as presentation from '../../../helpers/partyTaskPresentation.js'
import * as views from '../../../helpers/partyTaskViews.js'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const compile = (name, overrides = {}, environment = {}) => {
  const code = transformSync(
    readFileSync(new URL(`./${name}.js`, import.meta.url), 'utf8'),
    {
      filename: `${name}.js`,
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        transform: { react: { runtime: 'automatic' } },
      },
      module: { type: 'commonjs' },
    }
  ).code
  const compiledModule = { exports: {} }
  const dependencies = {
    '@helpers/partyTasks': taskHelpers,
    '@helpers/partyTaskPresentation': presentation,
    '@helpers/partyTaskViews': views,
    ...overrides,
  }
  new Function(
    'require',
    'module',
    'exports',
    ...Object.keys(environment),
    code
  )(
    (name) => dependencies[name] || require(name),
    compiledModule,
    compiledModule.exports,
    ...Object.values(environment)
  )
  return compiledModule.exports.default
}
const Card = compile('PartyTaskCard')
const Board = compile('PartyTaskBoard', { './PartyTaskCard': Card })
const props = {
  staffById: new Map([['staff1', 'Ирина']]),
  rolesById: new Map([['role1', 'Руководитель']]),
  onMutate() {},
  onEdit() {},
  onLoadMore() {},
  onDragStart() {},
  onDragEnd() {},
}
const task = {
  _id: 'task1',
  title: 'Подготовить сцену',
  status: 'new',
  revision: 2,
  assigneeStaffIds: ['staff1'],
  assigneeRoleId: 'role1',
}
const html = (value) =>
  renderToStaticMarkup(React.createElement(Card, { ...props, ...value }))
const walk = (node, predicate) => {
  if (!node || typeof node !== 'object') return []
  const found = predicate(node) ? [node] : []
  return found.concat(
    React.Children.toArray(node.props?.children).flatMap((child) =>
      walk(child, predicate)
    )
  )
}

test('board card renders one shared assignment and accessible status alternatives', () => {
  const rendered = html({ task: { ...task, canComplete: true }, board: true })
  assert.match(rendered, /Руководитель · Ирина/)
  assert.match(rendered, /Статус задачи «Подготовить сцену»/)
  assert.match(rendered, /draggable="true"/)
  assert.match(rendered, /<select/)
  assert.match(rendered, /value="in_progress"/)
  assert.match(rendered, /value="done"/)
})

test('edit-only task cannot be dragged or completed', () => {
  const rendered = html({ task: { ...task, canEdit: true }, board: true })
  assert.doesNotMatch(rendered, /draggable|<select|Вернуть в новые/)
  assert.match(rendered, /Изменить/)
})

test('terminal task reopening is controlled by explicit grant and keeps completion actor', () => {
  const done = {
    ...task,
    status: 'done',
    completedByStaffId: 'staff1',
    completedAt: '2026-10-28T10:00:00Z',
  }
  assert.doesNotMatch(
    html({ task: done, board: true }),
    /draggable|<select|Вернуть в новые/
  )
  const rendered = html({ task: { ...done, canReopen: true }, board: true })
  assert.match(rendered, /Выполнил: Ирина/)
  assert.match(rendered, /draggable="true"/)
  assert.match(rendered, /Вернуть в новые/)
})

test('ordinary select sends the same canonical status action as drag/drop', () => {
  const calls = []
  const tree = Card({
    ...props,
    task: { ...task, canComplete: true },
    board: true,
    onMutate: (...args) => calls.push(args),
  })
  const select = walk(tree, (node) => node.type === 'select')[0]
  select.props.onChange({ target: { value: 'done' } })
  assert.equal(calls[0][0].revision, 2)
  assert.deepEqual(calls[0][1], { action: 'status', status: 'done' })
  select.props.onChange({ target: { value: 'canceled' } })
  assert.equal(calls.length, 1)
})

test('board reports loaded counts honestly and keeps continuation for empty chunks', () => {
  const rendered = renderToStaticMarkup(
    React.createElement(Board, {
      ...props,
      columns: {
        new: { tasks: [task], nextCursor: 'cursor1' },
        in_progress: { tasks: [], nextCursor: 'cursor2' },
        done: { tasks: [], nextCursor: null },
      },
    })
  )
  assert.match(rendered, /Показано 1\+/)
  assert.match(rendered, /Поиск продолжается/)
  assert.match(rendered, /Показать ещё: В работе/)
  assert.equal((rendered.match(/Подготовить сцену/g) || []).length, 1)
  assert.match(rendered, /lg:grid-cols-3/)
  assert.match(rendered, /grid-cols-1/)
})

// Run the actual workspace component and its effects without a browser or DOM.
// Controllable promises verify query races; the React SSR tests above cover
// the real rendering of cards and columns.
const workspaceHarness = ({ narrow = true, respond } = {}) => {
  const hooks = [],
    timers = new Map(),
    requests = [],
    guards = []
  let cursor = 0,
    changed = true,
    tree,
    effects = [],
    timerId = 0
  let componentProps = { companyId: 'company1' }
  const differs = (a, b) =>
    !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
  const mockReact = {
    ...React,
    useState(initial) {
      const index = cursor++
      hooks[index] ||= {
        value: typeof initial === 'function' ? initial() : initial,
      }
      return [
        hooks[index].value,
        (next) => {
          const value =
            typeof next === 'function' ? next(hooks[index].value) : next
          if (!Object.is(value, hooks[index].value)) {
            hooks[index].value = value
            changed = true
          }
        },
      ]
    },
    useRef(initial) {
      const index = cursor++
      return (hooks[index] ||= { current: initial })
    },
    useId() {
      const index = cursor++
      return (hooks[index] ||= { value: `id${index}` }).value
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!hooks[index] || differs(hooks[index].deps, deps))
        hooks[index] = { deps, callback }
      return hooks[index].callback
    },
    useEffect(callback, deps) {
      const index = cursor++
      if (!hooks[index] || differs(hooks[index].deps, deps)) {
        const previous = hooks[index]
        hooks[index] = { deps }
        effects.push(() => {
          previous?.cleanup?.()
          hooks[index].cleanup = callback()
        })
      }
    },
  }
  const metadata = {
    tasks: [task],
    staff: [{ _id: 'staff1', name: 'Ирина' }],
    roles: [],
    currentStaffId: 'staff1',
    canCreate: true,
    nextCursor: null,
  }
  const Workspace = compile(
    'PartyTasks',
    {
      react: mockReact,
      'next/dynamic': () => () => null,
      '@helpers/apiClient': {
        apiJson: async (url, options) => {
          requests.push({ url, options })
          const data = respond
            ? await respond(url, options, metadata)
            : {
                ...metadata,
                tasks: metadata.tasks.filter(
                  (row) =>
                    !new URL(url, 'http://test').searchParams.get('status') ||
                    row.status ===
                      new URL(url, 'http://test').searchParams.get('status')
                ),
              }
          return { data }
        },
      },
      '@components/FieldHelp': () => null,
      '@components/party/navigation/usePartyUnsavedChanges': (
        _dirty,
        options
      ) => guards.push(options),
      './PartyTaskBoard': Board,
      './PartyTaskCard': Card,
    },
    {
      window: {
        matchMedia: () => ({ matches: narrow }),
        localStorage: { getItem: () => null, setItem() {} },
        confirm: () => true,
      },
      setTimeout: (callback) => {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: (id) => timers.delete(id),
    }
  )
  const flush = () => {
    let passes = 0
    while (changed) {
      if (++passes > 40) throw new Error('Workspace render did not settle')
      changed = false
      cursor = 0
      effects = []
      tree = Workspace(componentProps)
      effects.forEach((effect) => effect())
    }
    return tree
  }
  return {
    requests,
    guards,
    flush,
    async settle() {
      for (let i = 0; i < 12; i++) {
        flush()
        await Promise.resolve()
      }
      return flush()
    },
    find(predicate) {
      return walk(flush(), predicate)
    },
    runTimers() {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach((callback) => callback())
      flush()
    },
    setCompany(companyId) {
      componentProps = { companyId }
      changed = true
      flush()
    },
  }
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('desktop workspace loads each board column separately and sends assignment filter to server', async () => {
  const harness = workspaceHarness({ narrow: false })
  await harness.settle()
  const statusRequests = harness.requests.filter((row) =>
    new URL(row.url, 'http://test').searchParams.has('status')
  )
  assert.deepEqual(
    statusRequests.map((row) =>
      new URL(row.url, 'http://test').searchParams.get('status')
    ),
    ['new', 'in_progress', 'done']
  )
  assert.ok(
    statusRequests.every(
      (row) =>
        new URL(row.url, 'http://test').searchParams.get('filter') === 'all'
    )
  )
  const roleButton = harness.find(
    (node) => node.type === 'button' && node.props.children === 'Моей должности'
  )[0]
  roleButton.props.onClick()
  await harness.settle()
  assert.ok(
    harness.requests
      .slice(-3)
      .every(
        (row) =>
          new URL(row.url, 'http://test').searchParams.get('scope') === 'role'
      )
  )
})

test('workspace ignores late company replies and aborts their request', async () => {
  const first = deferred()
  const harness = workspaceHarness({
    respond: (_url, options, metadata) =>
      options.headers['x-partycrm-company-id'] === 'company1'
        ? first.promise
        : { ...metadata, tasks: [{ ...task, _id: 'company2-task' }] },
  })
  harness.flush()
  harness.setCompany('company2')
  await harness.settle()
  assert.equal(harness.requests[0].options.signal.aborted, true)
  first.resolve({
    tasks: [{ ...task, _id: 'stale-task' }],
    staff: [],
    roles: [],
    currentStaffId: 'staff1',
  })
  await harness.settle()
  assert.deepEqual(
    harness
      .find((node) => node.type === Card)
      .map((node) => node.props.task._id),
    ['company2-task']
  )
})

test('workspace pending PATCH blocks navigation and controls and preserves revision in canonical action', async () => {
  const patch = deferred()
  const harness = workspaceHarness({
    respond: (_url, options, metadata) =>
      options.method === 'PATCH'
        ? patch.promise
        : { ...metadata, tasks: [{ ...task, canComplete: true }] },
  })
  await harness.settle()
  const card = harness.find((node) => node.type === Card)[0]
  const mutation = card.props.onMutate(card.props.task, {
    action: 'status',
    status: 'done',
  })
  harness.flush()
  const request = harness.requests.find((row) => row.options.method === 'PATCH')
  assert.deepEqual(JSON.parse(request.options.body), {
    revision: 2,
    action: 'status',
    status: 'done',
  })
  assert.equal(harness.guards.at(-1).pending, true)
  assert.equal(
    harness.find(
      (node) =>
        node.type === 'select' && node.props['aria-label'] === 'Статус задач'
    )[0].props.disabled,
    true
  )
  patch.resolve({ ...task, status: 'done', revision: 3 })
  await mutation
  await harness.settle()
  assert.equal(harness.guards.at(-1).pending, false)
  assert.ok(harness.requests.filter((row) => !row.options.method).length >= 2)
})

test('workspace search resets visible results before the deferred server reply', async () => {
  const search = deferred()
  const harness = workspaceHarness({
    respond: (url, _options, metadata) =>
      new URL(url, 'http://test').searchParams.has('search')
        ? search.promise
        : metadata,
  })
  await harness.settle()
  const input = harness.find(
    (node) => node.type === 'input' && node.props.type === 'search'
  )[0]
  input.props.onChange({ target: { value: 'Второй заказ' } })
  harness.flush()
  harness.runTimers()
  assert.equal(harness.find((node) => node.type === Card).length, 0)
  assert.equal(
    new URL(harness.requests.at(-1).url, 'http://test').searchParams.get(
      'search'
    ),
    'Второй заказ'
  )
  search.resolve({
    tasks: [{ ...task, _id: 'match' }],
    staff: [],
    roles: [],
    currentStaffId: 'staff1',
  })
  await harness.settle()
  assert.equal(
    harness.find((node) => node.type === Card)[0].props.task._id,
    'match'
  )
})

test('one failed column never renders a false empty or partially successful board', async () => {
  const harness = workspaceHarness({
    narrow: false,
    respond: (url, _options, metadata) => {
      const status = new URL(url, 'http://test').searchParams.get('status')
      if (status === 'done') throw new Error('Не удалось загрузить задачи')
      return metadata
    },
  })
  await harness.settle()
  assert.equal(harness.find((node) => node.type === Board).length, 0)
  assert.equal(
    harness.find((node) => node.props?.role === 'alert')[0].props.children,
    'Не удалось загрузить задачи'
  )
  assert.equal(
    harness.find((node) => node.props?.children === 'Загрузка задач…').length,
    0
  )
})

test('late save completion cannot clear loading of another company', async () => {
  const save = deferred()
  const company = deferred()
  const harness = workspaceHarness({
    respond: (_url, options, metadata) => {
      if (options.method === 'POST') return save.promise
      return options.headers['x-partycrm-company-id'] === 'company2'
        ? company.promise
        : metadata
    },
  })
  await harness.settle()
  harness
    .find(
      (node) => node.type === 'button' && node.props.children === '+ Задача'
    )[0]
    .props.onClick()
  const savePromise = harness
    .find((node) => node.type === 'form')[0]
    .props.onSubmit({ preventDefault() {} })
  harness.flush()
  harness.setCompany('company2')
  save.resolve({ ...task, _id: 'new-company1-task' })
  await savePromise
  await harness.settle()
  assert.equal(
    harness.find(
      (node) => node.type === 'button' && node.props.children === 'Обновить'
    )[0].props.disabled,
    true
  )
  company.resolve({ tasks: [], staff: [], roles: [], currentStaffId: 'staff2' })
  await harness.settle()
  assert.equal(
    harness.find(
      (node) => node.type === 'button' && node.props.children === 'Обновить'
    )[0].props.disabled,
    false
  )
  assert.equal(harness.find((node) => node.type === Card).length, 0)
})
