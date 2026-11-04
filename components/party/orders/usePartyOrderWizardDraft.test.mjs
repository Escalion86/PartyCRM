import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as draftStorage from '../../../helpers/partyOrderWizardDraft.js'
import { createHookHost } from './partyOrderBoardTestHost.mjs'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('./usePartyOrderWizardDraft.js', import.meta.url), 'utf8')
const code = require('next/dist/build/swc').transformSync(source, {
  filename: 'usePartyOrderWizardDraft.js',
  jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
}).code
const scope = draftStorage.getPartyOrderWizardDraftScope({ tenantId: 'company-a', staff: { _id: 'staff-a' }, role: 'owner' })
const value = (note = '') => ({
  draft: { orderTypeId: '', locationId: '', customAddress: '', eventDate: '', clientId: '', adminComment: note, placeType: 'client_address', serviceSelections: [], eventBrief: {}, discount: { type: 'amount', value: 0 }, rental: null },
  step: -1, reachedStep: -1, rentalMinutes: 60, expectations: [], initialPayment: { amount: '', paymentMethod: 'transfer' }, attempt: null,
})
const setup = (initial = null, unavailable = false) => {
  const items = new Map(initial ? [[scope.key, initial]] : [])
  const listeners = new Map()
  const storage = {
    getItem: (key) => { if (unavailable) throw Error('Storage disabled'); return items.get(key) || null },
    setItem: (key, entry) => { if (unavailable) throw Error('Storage disabled'); items.set(key, entry) },
    removeItem: (key) => items.delete(key),
  }
  const host = createHookHost((hooks) => {
    const compiledModule = { exports: {} }
    new Function('require', 'module', 'exports', 'sessionStorage', 'window', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
      (name) => name === 'react' ? hooks : draftStorage, compiledModule, compiledModule.exports, storage,
      { addEventListener: (name, run) => listeners.set(name, run), removeEventListener: (name) => listeners.delete(name) },
      hooks.setTimeout, hooks.clearTimeout, hooks.setTimeout, hooks.clearTimeout,
    )
    return (props) => compiledModule.exports.default(scope, props.value, props.dirty)
  }, { value: value(), dirty: false })
  host.render()
  return { host, items, listeners }
}

test('recovery waits for a choice and never overwrites the pending draft', () => {
  const encoded = draftStorage.encodePartyOrderWizardDraft(scope, value('Прежнее обращение'))
  const h = setup(encoded)
  h.host.timers()
  assert.equal(h.host.value.recovery.draft.adminComment, 'Прежнее обращение')
  h.host.setProps({ value: value('Новая запись'), dirty: true })
  h.host.timers()
  assert.equal(h.items.get(scope.key), encoded)
  h.host.value.discard()
  assert.equal(h.items.has(scope.key), false)
  h.host.value.clear()
  h.host.dispose()
})

test('page interruption flushes the latest input and explicit clear prevents resurrection on unmount', () => {
  const h = setup()
  h.host.timers()
  h.host.setProps({ value: value('Последний ввод'), dirty: true })
  h.listeners.get('beforeunload')()
  assert.equal(draftStorage.decodePartyOrderWizardDraft(scope, h.items.get(scope.key)).draft.adminComment, 'Последний ввод')
  h.host.value.clear()
  h.host.dispose()
  assert.equal(h.items.has(scope.key), false)
})

test('unavailable storage leaves the form usable and reports the limitation', () => {
  const h = setup(null, true)
  h.host.timers()
  assert.equal(h.host.value.ready, true)
  assert.equal(h.host.value.storageState, 'unavailable')
  assert.doesNotThrow(() => h.host.value.write(value('Черновик')))
  h.host.dispose()
})

test('returning to the initial values removes the stale recovery record even before debounce', () => {
  const h = setup()
  h.host.timers()
  h.host.setProps({ value: value('Временный ввод'), dirty: true })
  h.host.timers()
  assert.equal(h.items.has(scope.key), true)
  h.host.setProps({ value: value(), dirty: false })
  h.listeners.get('beforeunload')()
  assert.equal(h.items.has(scope.key), false)
  h.host.dispose()
})
