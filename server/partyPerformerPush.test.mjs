import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { collectPartyPerformerAssignmentPushTargets } from './partyPerformerPushCore.js'
import {
  buildPartyPerformerAssignmentPushPayload,
  buildPartyPerformerLinkRequestPushPayload,
} from './partyPushCore.js'

const source = (
  await readFile(new URL('./partyPerformerPush.js', import.meta.url), 'utf8')
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
const tenantId = 'tenant-a'
const staffId = 'staff-a'
const userId = 'user-a'
const positionId = 'position-a'
const company = {
  title: 'Компания',
  settings: { notifications: { pushEnabled: true } },
}
const order = {
  _id: 'order-a',
  tenantId,
  status: 'active',
  workflowStageId: 'ready',
  locationId: 'venue-a',
  title: 'Секретное название',
  serviceTitle: 'Шоу',
  eventDate: '2026-12-01T13:00:00Z',
  assignedStaff: [
    { staffId, role: 'Исполнитель', confirmationStatus: 'confirmed' },
  ],
}

const setup = ({
  permissions = { orders: 'read' },
  orderScope = {},
  staffChanges = {},
  positionChanges = {},
  users,
  roles,
  nextOrder = order,
  previousOrder = null,
  companyValue = company,
} = {}) => {
  const staff = {
    _id: staffId,
    tenantId,
    status: 'active',
    role: 'performer',
    positionId,
    authUserId: userId,
    ...staffChanges,
  }
  const positions = roles || [
    {
      _id: positionId,
      tenantId,
      active: true,
      permissions,
      orderScope,
      ...positionChanges,
    },
  ]
  const calls = { staff: [], roles: [], users: [], pushes: [] }
  const query = (rows) => {
    let selection = null
    return {
      select(value) {
        selection = value.split(' ').map((key) => key.split('.')[0])
        return this
      },
      async lean() {
        return rows.map((row) =>
          selection
            ? Object.fromEntries(
                selection
                  .filter((key) => key in row)
                  .map((key) => [key, row[key]])
              )
            : row
        )
      },
    }
  }
  const deps = {
    canPartyAccess,
    collectPartyPerformerAssignmentPushTargets,
    buildPartyPerformerAssignmentPushPayload,
    buildPartyPerformerLinkRequestPushPayload,
    getPartyStaffModel: async () => ({
      find: (filter) => {
        calls.staff.push(filter)
        assert.equal(filter.tenantId, tenantId)
        assert.equal(filter.status, 'active')
        return query(
          filter._id.$in.includes(staff._id) &&
            staff.tenantId === filter.tenantId &&
            staff.status === filter.status
            ? [staff]
            : []
        )
      },
    }),
    getPartyRoleModel: async () => ({
      find: (filter) => {
        calls.roles.push(filter)
        assert.equal(filter.tenantId, tenantId)
        return query(
          positions.filter((position) => position.tenantId === filter.tenantId)
        )
      },
    }),
    getPartyUserModel: async () => ({
      find: (filter) => {
        calls.users.push(filter)
        assert.equal(filter.status, 'active')
        return query(
          (users || [{ _id: userId, status: 'active' }]).filter(
            (user) =>
              filter._id.$in.includes(user._id) && user.status === filter.status
          )
        )
      },
    }),
    sendPushToTenant: async (args) => {
      calls.pushes.push(args)
      return { ok: true }
    },
  }
  const service = new Function(
    ...Object.keys(deps),
    `${source}\nreturn {sendPartyPerformerAssignmentPushes,sendPartyPerformerLinkRequestPush}`
  )(...Object.values(deps))
  return {
    calls,
    send: () =>
      service.sendPartyPerformerAssignmentPushes({
        tenantId,
        company: companyValue,
        nextOrder,
        previousOrder,
      }),
    link: () =>
      service.sendPartyPerformerLinkRequestPush({
        tenantId,
        company: companyValue,
        staff,
        targetUserId: userId,
      }),
  }
}

test('assignment push checks the current position order scope before looking up recipients or sending', async () => {
  for (const options of [
    { permissions: { orders: 'hidden' } },
    { orderScope: { stageIds: ['another-stage'] } },
    { orderScope: { locationIds: ['another-venue'], includeUnlocated: false } },
    { orderScope: { statuses: ['draft'] } },
    { positionChanges: { active: false } },
    { staffChanges: { positionId: 'removed-position' } },
    { staffChanges: { status: 'paused' } },
    { staffChanges: { tenantId: 'another-company' } },
  ]) {
    const instance = setup(options)
    assert.deepEqual(await instance.send(), {
      attempted: 0,
      sent: 0,
      failed: 0,
    })
    assert.equal(instance.calls.pushes.length, 0)
    assert.equal(instance.calls.users.length, 0)
  }
})

test('push masks title, service and event date with independent current field grants', async () => {
  const hidden = setup()
  assert.deepEqual(await hidden.send(), { attempted: 1, sent: 1, failed: 0 })
  assert.equal(hidden.calls.pushes[0].payload.body, 'Новое назначение: Заказ')
  assert.doesNotMatch(
    JSON.stringify(hidden.calls.pushes),
    /Секретное|Шоу|2026-12-01/
  )

  const serviceOnly = setup({
    permissions: { orders: 'read', 'orders.serviceTitle': 'read' },
  })
  await serviceOnly.send()
  assert.equal(
    serviceOnly.calls.pushes[0].payload.body,
    'Новое назначение: Шоу'
  )

  const visible = setup({
    permissions: {
      orders: 'read',
      'orders.title': 'read',
      'orders.eventDate': 'read',
    },
    previousOrder: { ...order, eventDate: '2026-11-30T13:00:00Z' },
  })
  await visible.send()
  assert.equal(
    visible.calls.pushes[0].payload.body,
    `Назначение изменено: ${order.title}: ${order.eventDate}`
  )
  assert.equal(visible.calls.pushes[0].targetUserId, userId)
  assert.equal(visible.calls.pushes[0].tenantId, tenantId)
  assert.equal(visible.calls.pushes[0].payload.data.url, '/performer/work')
})

test('disabled builtin positions never restore defaults, while legacy active builtins still resolve', async () => {
  const options = {
    staffChanges: { positionId: null },
    roles: [
      {
        _id: 'builtin',
        tenantId,
        systemKey: 'performer',
        active: false,
        permissions: { orders: 'read' },
      },
    ],
  }
  const disabled = setup(options)
  assert.equal((await disabled.send()).attempted, 0)
  const active = setup({
    ...options,
    roles: [{ ...options.roles[0], active: true }],
  })
  assert.equal((await active.send()).sent, 1)
  const legacy = setup({ staffChanges: { positionId: null }, roles: [] })
  assert.equal((await legacy.send()).sent, 1)
  assert.equal(legacy.calls.pushes[0].payload.data.url, '/performer')
})

test('personal opt-out, blocked and missing users receive neither assignments nor link requests', async () => {
  for (const users of [
    [],
    [{ _id: userId, status: 'blocked' }],
    [
      {
        _id: userId,
        status: 'active',
        performerSettings: { notifications: { pushEnabled: false } },
      },
    ],
  ]) {
    const instance = setup({ users })
    assert.equal((await instance.send()).attempted, 0)
    assert.equal((await instance.link()).attempted, 0)
    assert.equal(instance.calls.pushes.length, 0)
  }
})

test('company push opt-out remains a no-op before database reads', async () => {
  const instance = setup({
    companyValue: { settings: { notifications: { pushEnabled: false } } },
  })
  assert.equal((await instance.send()).skipped, 'push_disabled')
  assert.equal(instance.calls.staff.length, 0)
  assert.equal(instance.calls.roles.length, 0)
})
