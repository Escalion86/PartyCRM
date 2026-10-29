import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHookHost } from '../orders/partyOrderBoardTestHost.mjs'

const source = readFileSync(
  new URL('./usePartyResourceCalendar.js', import.meta.url),
  'utf8'
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(
    'export default function usePartyResourceCalendar',
    'function usePartyResourceCalendar'
  )
const createHook = new Function(
  'useCallback',
  'useEffect',
  'useRef',
  'useState',
  'apiJson',
  `${source}\nreturn usePartyResourceCalendar`
)
const props = {
  companyId: 'a'.repeat(24),
  type: 'location',
  dateFrom: '2026-10-28T17:00:00Z',
  dateTo: '2026-10-29T17:00:00Z',
}
const response = (type, extra = {}) => ({
  data: {
    type,
    resourceTypes: [{ id: type }],
    resources: [],
    items: [],
    ...extra,
  },
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const host = (api, initial = props) =>
  createHookHost((hooks) => {
    const useHook = createHook(
      hooks.useCallback,
      hooks.useEffect,
      hooks.useRef,
      hooks.useState,
      api
    )
    return (input) => useHook(input)
  }, initial)

test('actual resource hook scopes a bounded read and drops old company data before the next response', async () => {
  const calls = [],
    pending = deferred()
  const h = host((url, options) => {
    calls.push({ url, options })
    return calls.length === 1
      ? Promise.resolve(response('location', { notice: 'old' }))
      : pending.promise
  })
  h.render()
  await h.flush()
  assert.equal(h.value.data.notice, 'old')
  h.setProps({ companyId: 'b'.repeat(24) })
  assert.equal(h.value.data, null)
  assert.equal(h.value.busy, true)
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(
    calls[1].options.headers['x-partycrm-company-id'],
    'b'.repeat(24)
  )
  assert.equal(calls[1].options.cache, 'no-store')
  const url = new URL(calls[1].url, 'https://test.example')
  assert.equal(url.searchParams.get('dateTo'), props.dateTo)
  pending.resolve(response('location', { notice: 'new' }))
  await h.flush()
  assert.equal(h.value.data.notice, 'new')
  h.dispose()
})

test('late resource-type responses cannot replace current role errors; retry is explicit', async () => {
  const old = deferred()
  let calls = 0
  const h = host(() => {
    calls += 1
    if (calls === 1) return old.promise
    return calls === 2
      ? Promise.reject(new Error('Нет доступа к реквизиту'))
      : Promise.resolve(response('inventory'))
  })
  h.render()
  h.setProps({ type: 'inventory' })
  await h.flush()
  assert.equal(h.value.error, 'Нет доступа к реквизиту')
  old.resolve(response('location', { items: [{ title: 'Old private title' }] }))
  await h.flush()
  assert.equal(h.value.data, null)
  assert.equal(h.value.error, 'Нет доступа к реквизиту')
  h.value.reload()
  h.render()
  await h.flush()
  assert.equal(h.value.data.type, 'inventory')
  assert.equal(calls, 3)
  h.dispose()
})

test('malformed resource DTO is an error, disabled state never reads, and unmount aborts', async () => {
  const calls = []
  const h = host(
    (_url, options) => {
      calls.push(options)
      return Promise.resolve({ data: { type: 'location', resources: [] } })
    },
    { ...props, enabled: false }
  )
  h.render()
  assert.equal(calls.length, 0)
  assert.equal(h.value.busy, false)
  h.setProps({ enabled: true })
  await h.flush()
  assert.match(h.value.error, /Не удалось получить календарь/)
  assert.equal(h.value.data, null)
  h.dispose()
  assert.equal(calls[0].signal.aborted, true)
})

test('resource search is sent to the server and same-company access updates suppress old fields immediately', async () => {
  const calls = [],
    pending = deferred()
  const h = host(
    (url, options) => {
      calls.push({ url, options })
      return calls.length === 1
        ? Promise.resolve(
            response('location', { notice: 'old authorized title' })
          )
        : pending.promise
    },
    { ...props, accessVersion: 'initial' }
  )
  h.render()
  await h.flush()
  assert.equal(h.value.data.notice, 'old authorized title')
  h.setProps({ resourceSearch: 'зал [2]', accessVersion: 'revoked-title' })
  assert.equal(h.value.data, null)
  assert.equal(h.value.busy, true)
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(
    new URL(calls[1].url, 'https://test.example').searchParams.get(
      'resourceSearch'
    ),
    'зал [2]'
  )
  pending.resolve(response('location', { notice: 'new limited projection' }))
  await h.flush()
  assert.equal(h.value.data.notice, 'new limited projection')
  h.dispose()
})
