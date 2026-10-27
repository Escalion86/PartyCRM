import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./pushNotifications.js', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('const sendPushToTenant = async'), source.indexOf('const getPushPublicKey ='))
  .replace("await import('./partyTaskEffects')", 'await Promise.resolve({ authorizePartyTaskPushTarget: authorize })')
  .replace("await import('./partyModels')", 'await Promise.resolve({ getPartyStaffModel: getStaff })')
const tenantId = 'a'.repeat(24), userId = 'b'.repeat(24), taskId = 'c'.repeat(24)

const setup = (authorization) => {
  const calls = { bodies: [], staffFilters: [], authorizations: [] }
  const chain = (value) => ({ select() { return this }, lean: async () => value })
  const bindings = {
    ensureWebPushConfigured: () => true, logPushDelivery: async () => {},
    authorize: async (args) => { calls.authorizations.push(args); return authorization },
    PushSubscriptions: { find: () => chain([{ endpoint: 'test-endpoint', keys: {}, userId }]), updateOne: async () => {} },
    buildPushSubscriptionFindFilter: (args) => { assert.equal(args.tenantId, tenantId); assert.equal(args.targetUserId, userId); return args },
    getStaff: async () => ({ find: (filter) => { calls.staffFilters.push(filter); return chain(filter.role ? [] : [{ authUserId: userId }]) } }),
    normalizeWebPushTopic: () => 'test-topic', parseSubscription: (doc) => doc,
    webpush: { sendNotification: async (_subscription, payload) => { calls.bodies.push(JSON.parse(payload)); return { statusCode: 201 } } },
  }
  return { calls, send: new Function(...Object.keys(bindings), `${body}\nreturn sendPushToTenant`)(...Object.values(bindings)) }
}

test('task opt-in does not broaden ordinary role-based push delivery', async () => {
  const h = setup({ authorized: true })
  const result = await h.send({ tenantId, product: 'partycrm', targetUserId: userId, payload: { title: 'Обычное уведомление' } })
  assert.equal(result.sent, 0)
  assert.deepEqual(h.calls.staffFilters[0].role, { $in: ['owner', 'admin', 'performer'] })
  assert.equal(h.calls.authorizations.length, 0)
})

test('an explicitly verified task target can receive only its individually targeted task push', async () => {
  const h = setup({ authorized: true, generic: false })
  const result = await h.send({ tenantId, product: 'partycrm', targetUserId: userId, authorizedTaskTarget: { taskId, event: 'assigned' }, payload: { title: 'Задача' } })
  assert.equal(result.sent, 1)
  assert.deepEqual(h.calls.authorizations, [{ tenantId, targetUserId: userId, taskId, event: 'assigned' }])
  assert.equal(h.calls.staffFilters[0].status, 'active')
  assert.equal(h.calls.staffFilters[0].tenantId, tenantId)
})

test('a caller-supplied opt-in never bypasses failed authorization and hidden cancellation content is rebuilt generically', async () => {
  const denied = setup({ authorized: false })
  const result = await denied.send({ tenantId, product: 'partycrm', targetUserId: userId, authorizedTaskTarget: { taskId, event: 'assigned' }, payload: { body: 'Secret' } })
  assert.equal(result.sent, 0); assert.equal(denied.calls.bodies.length, 0)
  const generic = setup({ authorized: true, generic: true })
  await generic.send({ tenantId, product: 'partycrm', targetUserId: userId, authorizedTaskTarget: { taskId, event: 'canceled' }, payload: { title: 'Secret client', body: 'Secret order' } })
  assert.equal(generic.calls.bodies[0].body, 'Задача по заказу отменена')
  assert.equal(JSON.stringify(generic.calls.bodies).includes('Secret'), false)
})
