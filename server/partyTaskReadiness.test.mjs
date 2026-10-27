import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('./partyTaskReadiness.js', import.meta.url), 'utf8')).replace(/^import[^\n]+\r?\n/gm, '').replaceAll('export const ', 'const ')

test('canonical task status overrides legacy items without deleting unassigned legacy tasks or duplicating blockers', async () => {
  const session = {}, tenantId = 'company'
  const order = { _id: 'order', additionalEvents: [{ _id: 'old', done: false }, { _id: 'unassigned', done: false }], preparation: { enabled: true, items: [{ _id: 'prep', status: 'pending' }] } }
  const rows = [{ sourceKey: 'order:order:additional:old', status: 'done' }, { sourceKey: 'order:order:preparation:prep', status: 'canceled' }, { _id: 'new', status: 'in_progress' }, { _id: 'completed', status: 'done' }]
  const deps = {
    ensurePartyOrderTasks: async (options) => { assert.equal(options.tenantId, tenantId); assert.equal(options.order, order); assert.equal(options.session, session) },
    getPartyTaskModel: async () => ({ find: (filter) => { assert.deepEqual(filter, { tenantId, orderId: 'order' }); return { select() { return this }, session(selected) { assert.equal(selected, session); return this }, lean: async () => rows } } }),
  }
  const run = new Function(...Object.keys(deps), `${source}\nreturn getPartyTaskOrderReadiness`)(...Object.values(deps))
  const result = await run({ tenantId, order, session })
  assert.deepEqual(result.order.additionalEvents.map((item) => item.done), [true, false])
  assert.equal(result.order.preparation.items[0].status, 'done')
  assert.equal(result.blockers.length, 1)
  assert.equal(result.blockers[0].count, 1)
  assert.equal(order.additionalEvents[0].done, false)
  assert.equal(order.preparation.items[0].status, 'pending')
})
