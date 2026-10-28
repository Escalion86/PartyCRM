import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildPartyOrderCalendarPeriod } from './partyOrderCalendarViewModel.js'
import { getPartyRoleCalendarRange } from '../../../helpers/partyRoleCalendar.js'

const source = (
  await readFile(new URL('./usePartyOrderCalendar.js', import.meta.url), 'utf8')
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(
    'export default function usePartyOrderCalendar',
    'function usePartyOrderCalendar'
  )
const createHook = new Function(
  'useCallback',
  'useEffect',
  'useRef',
  'useState',
  'apiJson',
  'getPartyRoleCalendarRange',
  'buildPartyOrderCalendarPeriod',
  `${source}\nreturn usePartyOrderCalendar`
)
const id = (n) => n.toString(16).padStart(24, '0')
const defaults = {
  companyId: 'company-a',
  enabled: true,
  month: new Date(2026, 9, 28, 13),
  view: 'week',
  accessKey: 'staff:role:revision',
  refreshKey: 0,
  ticketsEnabled: true,
}

// A minimal hook host executes the real data hook and React-style cleanup. It
// intentionally contains no calendar/query logic and makes no network calls.
const host = (apiJson, initial = {}) => {
  const slots = []
  let index = 0,
    effects = [],
    dirty = false,
    value,
    props = { ...defaults, ...initial }
  const state = (initialValue) => {
    const current = index++
    if (!(current in slots))
      slots[current] =
        typeof initialValue === 'function' ? initialValue() : initialValue
    return [
      slots[current],
      (next) => {
        slots[current] =
          typeof next === 'function' ? next(slots[current]) : next
        dirty = true
      },
    ]
  }
  const ref = (initialValue) => {
    const current = index++
    if (!(current in slots)) slots[current] = { current: initialValue }
    return slots[current]
  }
  const effect = (run, deps) => {
    const current = index++
    if (
      slots[current] &&
      deps.every((dep, i) => Object.is(dep, slots[current].deps[i]))
    )
      return
    effects.push(() => {
      slots[current]?.cleanup?.()
      slots[current] = { deps, cleanup: run() }
    })
  }
  const hook = createHook(
    (fn) => fn,
    effect,
    ref,
    state,
    apiJson,
    getPartyRoleCalendarRange,
    buildPartyOrderCalendarPeriod
  )
  const render = () => {
    index = 0
    effects = []
    dirty = false
    value = hook(props)
    for (const run of effects) run()
  }
  render()
  return {
    get value() {
      if (dirty) render()
      return value
    },
    update(next) {
      props = { ...props, ...next }
      render()
    },
    async waitFor(predicate) {
      for (let attempts = 0; attempts < 150; attempts++) {
        if (dirty) render()
        if (predicate(value)) return value
        await new Promise((resolve) => setTimeout(resolve, 2))
      }
      assert.fail(`Hook did not reach expected state: ${JSON.stringify(value)}`)
    },
    close() {
      for (const slot of slots) slot?.cleanup?.()
    },
  }
}

for (const view of ['month', 'week', 'day'])
  test(`real calendar hook requests exactly visible ${view} range and all pages of both feeds`, async () => {
    const reads = []
    const orders = Array.from({ length: 241 }, (_, i) => ({
      _id: id(i + 1),
      title: `Order ${i + 1}`,
      eventDate: new Date(2026, 9, 28, 10).toISOString(),
    }))
    const sessions = Array.from({ length: 81 }, (_, i) => ({
      _id: id(1001 + i),
      title: `Session ${i}`,
      startsAt: new Date(2026, 9, 28, 11).toISOString(),
      endsAt: new Date(2026, 9, 28, 12).toISOString(),
      status: 'scheduled',
      client: { name: 'Hidden buyer' },
      paidAmount: 999999,
    }))
    const api = async (url, request) => {
      const query = new URL(url, 'https://fixture.test'),
        ticket = query.pathname.endsWith('ticketing')
      reads.push({ query, request, ticket })
      await Promise.resolve()
      const cursor = query.searchParams.get(
        ticket ? 'cursor' : 'calendarCursor'
      )
      let rows = ticket ? sessions.toReversed() : orders
      if (cursor)
        rows = rows.filter((row) =>
          ticket ? row._id < cursor : row._id > cursor
        )
      const page = rows.slice(0, ticket ? 40 : 120)
      return {
        data: page,
        meta: {
          nextCursor: rows.length > page.length ? page.at(-1)._id : null,
        },
      }
    }
    const running = host(api, { view })
    try {
      const result = await running.waitFor(
        (value) => !value.busy && value.orders.length === 322
      )
      assert.equal(reads.length, 6)
      assert.equal(new Set(result.orders.map((row) => row._id)).size, 322)
      const range = getPartyRoleCalendarRange(
        buildPartyOrderCalendarPeriod(defaults.month, view)
      )
      for (const { query, request, ticket } of reads) {
        assert.equal(
          query.searchParams.get(ticket ? 'from' : 'dateFrom'),
          range.dateFrom
        )
        assert.equal(
          query.searchParams.get(ticket ? 'to' : 'dateTo'),
          range.dateTo
        )
        assert.equal(request.headers['x-partycrm-company-id'], 'company-a')
      }
      assert.deepEqual(
        reads.slice(0, 2).map((read) => read.ticket),
        [false, true]
      )
      const projectedSessions = result.orders.filter(
        (row) => row.calendarEntityType === 'ticket_session'
      )
      assert.equal(projectedSessions.length, 81)
      assert.doesNotMatch(
        JSON.stringify(projectedSessions),
        /Hidden buyer|999999/
      )
      assert.equal(projectedSessions[0].status, 'active')
    } finally {
      running.close()
    }
  })

test('disabled calendar never calls either feed; hidden tickets only fetch orders', async () => {
  let calls = 0
  const api = async () => {
    calls++
    return { data: [], meta: { nextCursor: null } }
  }
  const running = host(api, { enabled: false })
  assert.equal(calls, 0)
  running.update({ enabled: true, ticketsEnabled: false })
  await running.waitFor((value) => !value.busy)
  assert.equal(calls, 1)
  running.close()
})

test('switching company aborts old feeds and late results cannot restore previous company data', async () => {
  const pending = [],
    signals = []
  const api = async (url, request) => {
    const old = request.headers['x-partycrm-company-id'] === 'company-a'
    if (old) {
      signals.push(request.signal)
      await new Promise((resolve) => pending.push(resolve))
    }
    return {
      data: old ? [{ _id: id(1), title: 'Old company' }] : [],
      meta: { nextCursor: null },
    }
  }
  const running = host(api)
  running.update({ companyId: 'company-b' })
  await running.waitFor((value) => !value.busy)
  assert.equal(signals.length, 2)
  assert.equal(
    signals.every((signal) => signal.aborted),
    true
  )
  pending.forEach((resolve) => resolve())
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(running.value.orders, [])
  running.close()
})

test('any feed failure clears partial calendar; retry loads complete data', async () => {
  let fail = true
  const api = async (url) => {
    if (url.includes('/ticketing?') && fail)
      throw Error('Ticket feed unavailable')
    return {
      data: url.includes('/ticketing?') ? [] : [{ _id: id(1), title: 'Order' }],
      meta: { nextCursor: null },
    }
  }
  const running = host(api)
  const failed = await running.waitFor(
    (value) => !value.busy && Boolean(value.error)
  )
  assert.equal(failed.error, 'Ticket feed unavailable')
  assert.deepEqual(failed.orders, [])
  fail = false
  running.value.reload()
  const restored = await running.waitFor(
    (value) => !value.busy && !value.error && value.orders.length === 1
  )
  assert.equal(restored.orders[0].title, 'Order')
  running.close()
})

for (const broken of [
  'metadata',
  'invalidCursor',
  'repeatedCursor',
  'wrongDirection',
])
  test(`incomplete calendar (${broken}) is rejected rather than displayed as complete`, async () => {
    let count = 0
    const api = async () => {
      count++
      if (broken === 'metadata') return { data: [] }
      if (broken === 'invalidCursor')
        return { data: [], meta: { nextCursor: 'invalid' } }
      return {
        data: [],
        meta: {
          nextCursor: broken === 'wrongDirection' && count > 1 ? id(1) : id(2),
        },
      }
    }
    const running = host(api, { ticketsEnabled: false })
    const result = await running.waitFor(
      (value) => !value.busy && Boolean(value.error)
    )
    assert.deepEqual(result.orders, [])
    assert.match(result.error, /календарь/)
    running.close()
  })
