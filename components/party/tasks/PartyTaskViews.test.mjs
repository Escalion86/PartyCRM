import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as taskHelpers from '../../../helpers/partyTasks.js'
import * as presentation from '../../../helpers/partyTaskPresentation.js'
import * as views from '../../../helpers/partyTaskViews.js'
import * as focus from '../../../helpers/partyTaskFocus.js'

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
const workspaceHarness = ({
  narrow = true,
  respond,
  componentName = 'PartyTasks',
  initialProps = { companyId: 'company1' },
  overrides = {},
  environment = {},
} = {}) => {
  const hooks = [],
    timers = new Map(),
    requests = [],
    guards = []
  let cursor = 0,
    changed = true,
    tree,
    effects = [],
    timerId = 0
  let componentProps = initialProps
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
    componentName,
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
      '@helpers/partyTaskFocus': focus,
      ...overrides,
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
      ...environment,
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
    setProps(next) {
      componentProps = { ...componentProps, ...next }
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

test('an external focused-task update refreshes the list after an open editor is closed without discarding its draft', async () => {
  const harness = workspaceHarness()
  await harness.settle()
  harness
    .find(
      (node) => node.type === 'button' && node.props.children === '+ Задача'
    )[0]
    .props.onClick()
  harness
    .find((node) => node.type === 'input' && node.props.maxLength === 240)[0]
    .props.onChange({ target: { value: 'Несохранённая задача' } })
  harness.flush()
  const before = harness.requests.length
  harness.setProps({ refreshKey: 1 })
  await harness.settle()
  assert.equal(harness.requests.length, before)
  assert.equal(
    harness.find(
      (node) => node.type === 'input' && node.props.maxLength === 240
    )[0].props.value,
    'Несохранённая задача'
  )
  harness
    .find(
      (node) => node.type === 'button' && node.props.children === 'Отмена'
    )[0]
    .props.onClick()
  await harness.settle()
  assert.equal(harness.requests.length, before + 1)
  assert.equal(harness.find((node) => node.type === 'form').length, 0)
})

test('focused task actions send canonical revision and refresh callers without editing its unrelated fields', async () => {
  let changes = 0
  const harness = workspaceHarness({
    componentName: 'PartyTaskFocus',
    initialProps: {
      companyId: 'company1',
      taskId: task._id,
      onChanged: () => changes++,
    },
    respond: (_url, options) => ({
      ...task,
      canComplete: !options.method,
      status: options.method ? 'done' : 'new',
    }),
  })
  await harness.settle()
  const card = harness.find((node) => node.type === Card)[0]
  assert.equal(card.props.task.canEdit, false)
  await card.props.onMutate(card.props.task, {
    action: 'status',
    status: 'done',
  })
  await harness.settle()
  assert.deepEqual(JSON.parse(harness.requests.at(-1).options.body), {
    action: 'status',
    status: 'done',
    revision: 2,
  })
  assert.equal(changes, 1)
  assert.equal(
    harness.find((node) => node.type === Card)[0].props.task.status,
    'done'
  )
})

test('a focused task ignores a late response after another company or task is selected', async () => {
  const late = deferred()
  const harness = workspaceHarness({
    componentName: 'PartyTaskFocus',
    initialProps: { companyId: 'company1', taskId: task._id },
    respond: (_url, options) =>
      options.headers['x-partycrm-company-id'] === 'company1'
        ? late.promise
        : { ...task, _id: 'task2', title: 'Другая задача' },
  })
  harness.flush()
  const first = harness.requests[0]
  harness.setProps({ companyId: 'company2', taskId: 'task2' })
  await harness.settle()
  late.resolve({ ...task, title: 'Устаревшая задача' })
  await harness.settle()
  assert.equal(first.options.signal.aborted, true)
  assert.equal(
    harness.find((node) => node.type === Card)[0].props.task.title,
    'Другая задача'
  )
})

test('focused task failures render an error without a false task, and disabled drafts cannot mutate it', async () => {
  const broken = workspaceHarness({
    componentName: 'PartyTaskFocus',
    initialProps: { companyId: 'company1', taskId: task._id },
    respond: () => {
      throw new Error('Задача недоступна')
    },
  })
  await broken.settle()
  assert.equal(broken.find((node) => node.type === Card).length, 0)
  assert.equal(
    broken.find((node) => node.props?.role === 'alert')[0].props.children,
    'Задача недоступна'
  )
  const blocked = workspaceHarness({
    componentName: 'PartyTaskFocus',
    initialProps: { companyId: 'company1', taskId: task._id, disabled: true },
    respond: () => ({ ...task, canComplete: true }),
  })
  await blocked.settle()
  const card = blocked.find((node) => node.type === Card)[0]
  await card.props.onMutate(card.props.task, {
    action: 'status',
    status: 'done',
  })
  assert.equal(blocked.requests.length, 1)
})

const focusWorkspaceHarness = (search, companies) => {
  const published = []
  const TaskList = () => null
  const TaskFocus = () => null
  const instance = workspaceHarness({
    componentName: 'PartyTasksWorkspace',
    initialProps: { companies },
    overrides: {
      './PartyTasks': TaskList,
      './PartyTaskFocus': TaskFocus,
      '@helpers/partyActiveCompany': {
        readPartyActiveCompanyId: () => companies[0]?.id || '',
        publishPartyActiveCompanyId: (id) => {
          published.push(id)
          return true
        },
      },
      '@components/party/navigation/usePartyUnsavedChanges': {
        requestPartyLeave: () => true,
      },
      '@components/party/navigation/PartyUnsavedChangesBootstrap': () => null,
    },
    environment: {
      window: {
        location: {
          search,
          href: `https://app.example/performer/tasks${search}`,
        },
        addEventListener() {},
        removeEventListener() {},
        history: { state: { next: true }, replaceState() {} },
      },
      requestAnimationFrame: (callback) => {
        callback()
        return 1
      },
      cancelAnimationFrame() {},
    },
  })
  return { ...instance, TaskList, TaskFocus, published }
}

test('task workspace honors a validated task/company link before the remembered first company', async () => {
  const first = '1'.repeat(24),
    second = '2'.repeat(24),
    taskId = 'a'.repeat(24)
  const harness = focusWorkspaceHarness(
    `?companyId=${second}&taskId=${taskId}`,
    [{ id: first }, { id: second }]
  )
  await harness.settle()
  assert.equal(
    harness.find((node) => node.type === harness.TaskList)[0].props.companyId,
    second
  )
  assert.equal(
    harness.find((node) => node.type === harness.TaskFocus)[0].props.taskId,
    taskId
  )
  assert.deepEqual(harness.published, [second])
  const before = harness.find((node) => node.type === harness.TaskList)[0]
  harness.find((node) => node.type === harness.TaskFocus)[0].props.onChanged()
  const after = harness.find((node) => node.type === harness.TaskList)[0]
  assert.equal(after.key, before.key)
  assert.equal(after.props.refreshKey, before.props.refreshKey + 1)
})

test('foreign and incomplete task links display recovery selection without loading another company task', async () => {
  const companyId = '1'.repeat(24),
    taskId = 'a'.repeat(24)
  for (const search of [
    `?taskId=${taskId}`,
    `?companyId=${'2'.repeat(24)}&taskId=${taskId}`,
  ]) {
    const harness = focusWorkspaceHarness(search, [{ id: companyId }])
    await harness.settle()
    assert.equal(
      harness.find((node) => node.type === harness.TaskList).length,
      0
    )
    assert.equal(
      harness.find((node) => node.type === harness.TaskFocus).length,
      0
    )
    assert.equal(harness.find((node) => node.type === 'select').length, 1)
    assert.equal(harness.find((node) => node.props?.role === 'alert').length, 1)
    assert.deepEqual(harness.published, [])
  }
})
