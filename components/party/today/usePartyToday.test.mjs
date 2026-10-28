import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./usePartyToday.js', import.meta.url),
  'utf8'
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace('export default function usePartyToday', 'function usePartyToday')
const createHook = new Function(
  'useCallback',
  'useEffect',
  'useRef',
  'useState',
  'apiJson',
  `${source}\nreturn usePartyToday`
)
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

// Execute the actual hook and its effect cleanup without network or a browser.
const host = (api, initialCompany = 'company-a') => {
  const slots = []
  let index = 0,
    effects = [],
    dirty = false,
    value,
    companyId = initialCompany
  const useState = (initial) => {
    const at = index++
    if (!(at in slots))
      slots[at] = typeof initial === 'function' ? initial() : initial
    return [
      slots[at],
      (next) => {
        slots[at] = typeof next === 'function' ? next(slots[at]) : next
        dirty = true
      },
    ]
  }
  const useRef = (initial) => {
    const at = index++
    if (!(at in slots)) slots[at] = { current: initial }
    return slots[at]
  }
  const useEffect = (run, deps) => {
    const at = index++
    if (slots[at] && deps.every((dep, i) => Object.is(dep, slots[at].deps[i])))
      return
    effects.push(() => {
      slots[at]?.cleanup?.()
      slots[at] = { deps, cleanup: run() }
    })
  }
  const hook = createHook((fn) => fn, useEffect, useRef, useState, api)
  const render = () => {
    index = 0
    effects = []
    dirty = false
    value = hook(companyId)
    for (const run of effects) run()
  }
  render()
  return {
    get value() {
      if (dirty) render()
      return value
    },
    update(next) {
      companyId = next
      render()
    },
    async waitFor(predicate) {
      for (let i = 0; i < 100; i += 1) {
        if (dirty) render()
        if (predicate(value)) return value
        await new Promise((resolve) => setTimeout(resolve, 2))
      }
      assert.fail(`Unexpected Today state: ${JSON.stringify(value)}`)
    },
    close() {
      slots.forEach((slot) => slot?.cleanup?.())
    },
  }
}

test('Today hook reads only the selected tenant with no-store and suppresses previous data immediately', async () => {
  const reads = [],
    pending = deferred()
  const h = host(async (url, options) => {
    reads.push({ url, options })
    return reads.length === 1
      ? { data: { sections: [], generatedAt: 'old' } }
      : pending.promise
  })
  await h.waitFor((state) => state.data?.generatedAt === 'old')
  h.update('company-b')
  assert.equal(h.value.data, null)
  assert.equal(h.value.busy, true)
  assert.equal(reads[0].options.signal.aborted, true)
  assert.equal(reads[1].options.headers['x-partycrm-company-id'], 'company-b')
  assert.equal(reads[1].options.cache, 'no-store')
  pending.resolve({ data: { sections: [], generatedAt: 'new' } })
  await h.waitFor((state) => state.data?.generatedAt === 'new')
  h.close()
})

test('late old-company success cannot replace a new-company authorization error', async () => {
  const old = deferred()
  const h = host((_url, options) =>
    options.headers['x-partycrm-company-id'] === 'company-a'
      ? old.promise
      : Promise.reject(new Error('Нет доступа'))
  )
  h.update('company-b')
  await h.waitFor((state) => state.error === 'Нет доступа')
  old.resolve({ data: { sections: [{ id: 'private', items: [] }] } })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(h.value.error, 'Нет доступа')
  assert.equal(h.value.data, null)
  h.close()
})

test('malformed response is an error; explicit retry reissues the same scoped read', async () => {
  let calls = 0
  const h = host(async () =>
    ++calls === 1 ? { data: {} } : { data: { sections: [] } }
  )
  await h.waitFor((state) => Boolean(state.error))
  assert.equal(h.value.data, null)
  h.value.reload()
  await h.waitFor((state) => Boolean(state.data))
  assert.equal(calls, 2)
  assert.equal(h.value.error, '')
  h.close()
})

test('empty company performs no read and unmount aborts the active request', () => {
  const requests = []
  const h = host((_url, options) => {
    requests.push(options)
    return new Promise(() => {})
  }, '')
  assert.equal(requests.length, 0)
  assert.equal(h.value.busy, false)
  h.update('company-a')
  assert.equal(requests.length, 1)
  h.close()
  assert.equal(requests[0].signal.aborted, true)
})
