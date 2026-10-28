import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createHookHost } from './partyOrderBoardTestHost.mjs'

const source = (
  await readFile(new URL('./usePartyOrderBoard.js', import.meta.url), 'utf8')
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(
    'export default function usePartyOrderBoard',
    'function usePartyOrderBoard'
  )
const instantiate = (hooks, apiJson) =>
  new Function(
    ...Object.keys(hooks),
    'apiJson',
    `${source}\nreturn usePartyOrderBoard`
  )(...Object.values(hooks), apiJson)
const id = (n) => n.toString(16).padStart(24, '0')
const row = (n, stage = 'new') => ({
  _id: id(n),
  workflowStageId: stage,
  title: `Заказ ${n}`,
  updatedAt: '2026-10-29T10:00:00Z',
})
const page = (data = [], nextCursor = null) => ({
  data,
  meta: { nextCursor, hasMore: Boolean(nextCursor) },
})
const base = {
  companyId: 'first',
  enabled: true,
  accessKey: 'role-v1',
  stageIds: ['new', 'prepare'],
}
const setup = (apiJson, props = {}) => {
  const calls = []
  const host = createHookHost(
    (hooks) =>
      instantiate(hooks, async (url, options) => {
        calls.push({ url, options })
        return apiJson(new URL(url, 'http://test'), options)
      }),
    { ...base, ...props }
  )
  host.render()
  return { host, calls }
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('each stage is independently paginated with shared server filters and its own cursor', async () => {
  const { host, calls } = setup(
    async (url) => {
      const stage = url.searchParams.get('stageId')
      const next = url.searchParams.get('listCursor')
      if (stage === 'prepare') return page([row(500, stage)])
      return next
        ? page([row(59), row(58)])
        : page(
            Array.from({ length: 40 }, (_, index) => row(100 - index)),
            id(61)
          )
    },
    { search: 'Игла', quick: 'tasks' }
  )
  await host.flush()
  assert.equal(host.value.columns.new.orders.length, 40)
  assert.equal(host.value.columns.prepare.orders.length, 1)
  for (const call of calls) {
    const params = new URL(call.url, 'http://test').searchParams
    assert.equal(params.get('view'), 'list')
    assert.equal(params.get('q'), 'Игла')
    assert.equal(params.get('quick'), 'tasks')
    assert.equal(call.options.headers['x-partycrm-company-id'], 'first')
  }
  host.value.loadMore('new')
  await host.flush()
  assert.equal(host.value.columns.new.orders.length, 42)
  assert.equal(host.value.columns.prepare.orders.length, 1)
  assert.equal(calls.length, 3)
  assert.equal(
    new URL(calls.at(-1).url, 'http://test').searchParams.get('listCursor'),
    id(61)
  )
})

test('initial failure remains an error for that column while other stages load successfully', async () => {
  const { host } = setup(async (url) => {
    if (url.searchParams.get('stageId') === 'prepare')
      throw new Error('Нет соединения')
    return page([row(1)])
  })
  await host.flush()
  assert.equal(host.value.busy, false)
  assert.equal(host.value.columns.prepare.error, 'Нет соединения')
  assert.deepEqual(host.value.columns.prepare.orders, [])
  assert.equal(host.value.columns.new.orders.length, 1)
})

test('failed load-more keeps its previous cards and cursor, then retries the same page', async () => {
  let fail = true
  const { host, calls } = setup(
    async (url) => {
      if (!url.searchParams.get('listCursor')) return page([row(10)], id(10))
      if (fail) throw new Error('Ошибка страницы')
      return page([row(9)])
    },
    { stageIds: ['new'] }
  )
  await host.flush()
  host.value.loadMore('new')
  await host.flush()
  assert.equal(host.value.columns.new.orders.length, 1)
  assert.equal(host.value.columns.new.nextCursor, id(10))
  assert.equal(host.value.columns.new.errorMore, 'Ошибка страницы')
  fail = false
  host.value.loadMore('new')
  await host.flush()
  assert.equal(host.value.columns.new.orders.length, 2)
  assert.equal(host.value.columns.new.errorMore, '')
  assert.equal(
    new URL(calls.at(-1).url, 'http://test').searchParams.get('listCursor'),
    id(10)
  )
})

test('stale company replies are aborted and never replace a newly selected company', async () => {
  const first = deferred()
  const { host, calls } = setup(
    async (_url, options) =>
      options.headers['x-partycrm-company-id'] === 'first'
        ? first.promise
        : page([row(20)]),
    { stageIds: ['new'] }
  )
  host.setProps({ companyId: 'second' })
  await host.flush()
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(host.value.columns.new.orders[0]._id, id(20))
  first.resolve(page([row(1)]))
  await host.flush()
  assert.equal(host.value.columns.new.orders[0]._id, id(20))
})

test('search change hides stale results immediately and sends the settled search to every stage', async () => {
  const { host, calls } = setup(
    async (url) => page([row(url.searchParams.get('q') ? 20 : 1)]),
    { stageIds: ['new'] }
  )
  await host.flush()
  host.setProps({ search: 'Новый запрос' })
  assert.deepEqual(host.value.columns, {})
  assert.equal(host.value.busy, true)
  assert.equal(calls.length, 1)
  host.timers()
  await host.flush()
  assert.equal(host.value.columns.new.orders[0]._id, id(20))
  assert.equal(
    new URL(calls.at(-1).url, 'http://test').searchParams.get('q'),
    'Новый запрос'
  )
})

test('sparse task-filter scans keep a working continuation after three empty chunks', async () => {
  let count = 0
  const { host, calls } = setup(
    async () => {
      count += 1
      return count < 4 ? page([], id(100 - count)) : page([row(10)])
    },
    { stageIds: ['new'], quick: 'tasks' }
  )
  await host.flush()
  assert.equal(calls.length, 3)
  assert.deepEqual(host.value.columns.new.orders, [])
  assert.equal(host.value.columns.new.nextCursor, id(97))
  host.value.loadMore('new')
  await host.flush()
  assert.equal(host.value.columns.new.orders.length, 1)
})

test('repeated, ascending and malformed cursors fail without dropping already loaded cards', async () => {
  for (const next of [id(10), id(11), 'invalid']) {
    const { host } = setup(
      async (url) =>
        url.searchParams.get('listCursor')
          ? page([row(9)], next)
          : page([row(10)], id(10)),
      { stageIds: ['new'] }
    )
    await host.flush()
    host.value.loadMore('new')
    await host.flush()
    assert.equal(host.value.columns.new.orders.length, 1)
    assert.ok(host.value.columns.new.errorMore)
    assert.equal(host.value.columns.new.nextCursor, id(10))
    host.dispose()
  }
})

test('many configured stages use at most four parallel requests', async () => {
  let active = 0,
    peak = 0
  const pending = []
  const { host, calls } = setup(
    async () => {
      active += 1
      peak = Math.max(peak, active)
      const gate = deferred()
      pending.push(gate)
      await gate.promise
      active -= 1
      return page()
    },
    { stageIds: Array.from({ length: 10 }, (_, n) => `stage_${n}`) }
  )
  assert.equal(calls.length, 4)
  for (let iteration = 0; iteration < 4; iteration += 1) {
    pending.splice(0).forEach((gate) => gate.resolve())
    await host.flush()
  }
  assert.equal(calls.length, 10)
  assert.equal(peak, 4)
  assert.equal(host.value.busy, false)
})

test('disabled or empty board never requests hidden stages', async () => {
  for (const props of [{ enabled: false }, { stageIds: [] }]) {
    const { host, calls } = setup(async () => {
      throw new Error('Must not request')
    }, props)
    await host.flush()
    assert.equal(calls.length, 0)
    assert.equal(host.value.busy, false)
  }
})
