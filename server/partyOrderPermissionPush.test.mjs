import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const source = (
  await readFile(
    new URL('./partyOrderPermissionPush.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const tenantId = 'company-a',
  orderId = 'order-a'
const company = { settings: { notifications: { pushEnabled: true } } }
const order = {
  _id: orderId,
  tenantId,
  workflowStageId: 'ready',
  status: 'active',
  title: 'Секретный заказ',
  eventDate: '2026-12-01T10:00:00Z',
}
const staff = (suffix, changes = {}) => ({
  _id: `staff-${suffix}`,
  tenantId,
  role: 'performer',
  status: 'active',
  authUserId: `user-${suffix}`,
  positionId: `role-${suffix}`,
  ...changes,
})
const position = (suffix, changes = {}) => ({
  _id: `role-${suffix}`,
  tenantId,
  active: true,
  permissions: { orders: 'read' },
  orderScope: {},
  ...changes,
})
const setup = ({ enabled = true } = {}) => {
  const calls = { models: 0, roles: [], users: [], pushes: [] }
  const people = [
    staff('allowed'),
    staff('hidden-stage'),
    staff('inactive-builtin', { role: 'admin', positionId: null }),
    staff('opt-out'),
    staff('blocked-user'),
    staff('paused', { status: 'paused' }),
    staff('foreign', { tenantId: 'another-company' }),
    staff('missing-position'),
  ]
  const positions = [
    position('allowed'),
    position('hidden-stage', { orderScope: { stageIds: ['secret-stage'] } }),
    position('inactive-builtin', { systemKey: 'admin', active: false }),
    position('opt-out'),
    position('blocked-user'),
  ]
  const q = (rows) => ({
    select() {
      return this
    },
    lean: async () => rows,
  })
  const deps = {
    canPartyAccess,
    getPartyStaffModel: async () => {
      calls.models += 1
      return {
        find: (filter) => {
          assert.equal(filter.tenantId, tenantId)
          assert.equal(filter.status, 'active')
          return q(
            people.filter(
              (person) =>
                person.tenantId === filter.tenantId &&
                person.status === filter.status
            )
          )
        },
      }
    },
    getPartyRoleModel: async () => ({
      find: (filter) => {
        calls.roles.push(filter)
        return q(
          positions.filter(
            (role) =>
              role.tenantId === filter.tenantId &&
              (!('active' in filter) || role.active === filter.active)
          )
        )
      },
    }),
    getPartyUserModel: async () => ({
      find: (filter) => {
        calls.users.push(filter)
        return q(
          people
            .filter(
              (person) =>
                filter._id.$in.includes(person.authUserId) &&
                (person._id === 'staff-blocked-user' ? 'blocked' : 'active') ===
                  filter.status
            )
            .map((person) => ({
              _id: person.authUserId,
              performerSettings: {
                notifications: { pushEnabled: person._id !== 'staff-opt-out' },
              },
            }))
        )
      },
    }),
    sendPushToTenant: async (args) => {
      calls.pushes.push(args)
      return { ok: true, sent: 1 }
    },
  }
  const send = new Function(
    ...Object.keys(deps),
    `${source}\nreturn sendPartyOrderScopedPush`
  )(...Object.values(deps))
  return {
    calls,
    run: () =>
      send({
        tenantId,
        company: enabled
          ? company
          : { settings: { notifications: { pushEnabled: false } } },
        order,
        payload: {
          title: 'Скрытое имя',
          body: '+79139999999',
          data: {
            url: '/forbidden',
            amount: 99999,
            phone: '+79139999999',
            adminComment: 'Секрет',
          },
        },
      }),
  }
}

test('scoped lead push resolves fresh active grants, hidden stages and inactive builtins before user preferences', async () => {
  const instance = setup()
  assert.deepEqual(await instance.run(), { sent: 1 })
  assert.deepEqual(instance.calls.roles, [{ tenantId }])
  assert.deepEqual(instance.calls.users[0]._id.$in.sort(), [
    'user-allowed',
    'user-blocked-user',
    'user-opt-out',
  ])
  assert.equal(instance.calls.pushes.length, 1)
  assert.equal(instance.calls.pushes[0].targetUserId, 'user-allowed')
})

test('a lead notification whitelists its metadata and never spreads a raw contact, amount or URL', async () => {
  const instance = setup()
  await instance.run()
  const sent = instance.calls.pushes[0]
  assert.equal(sent.tenantId, tenantId)
  assert.deepEqual(sent.payload.data, {
    type: 'party_order',
    companyId: tenantId,
    orderId,
    url: '/performer/work',
  })
  assert.doesNotMatch(
    JSON.stringify(sent.payload),
    /Скрытое имя|79139999999|99999|Секрет|forbidden|adminComment/
  )
  assert.equal(sent.payload.title, 'Обновление заявки')
})

test('company push preference disables lookups and external dispatch', async () => {
  const instance = setup({ enabled: false })
  assert.deepEqual(await instance.run(), { sent: 0 })
  assert.equal(instance.calls.models, 0)
  assert.equal(instance.calls.pushes.length, 0)
})
