import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as taskHelpers from '../helpers/partyTasks.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const strip = (source) =>
  source
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
const service = strip(
  await readFile(new URL('./partyTasks.js', import.meta.url), 'utf8')
)
const summarySource = strip(
  await readFile(
    new URL('./partyOrderTaskSummaries.js', import.meta.url),
    'utf8'
  )
)
const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value))
const taskDeps = { ...taskHelpers, canPartyAccess, isValidObjectId }
const canReadTask = new Function(
  ...Object.keys(taskDeps),
  `${service}\nreturn canReadTask`
)(...Object.values(taskDeps))
const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  orderId = 'c'.repeat(24),
  positionId = 'd'.repeat(24)
const context = {
  tenantId,
  role: 'performer',
  staff: { _id: staffId, tenantId, role: 'performer', status: 'active' },
  position: {
    _id: positionId,
    permissions: { orders: 'read', tasks: 'read' },
    orderScope: {},
  },
}
const order = {
  _id: orderId,
  tenantId,
  status: 'active',
  workflowStageId: 'ready',
  locationId: 'own-venue',
  responsibleStaffId: staffId,
}
const task = (title, changes = {}) => ({
  _id: title,
  tenantId,
  orderId,
  title,
  status: 'new',
  assigneeStaffIds: [staffId],
  dueAt: '2026-10-28T10:00:00Z',
  ...changes,
})
const setup = (tasks = [], actor = context) => {
  const calls = []
  const deps = {
    canReadTask,
    canPartyAccess,
    getPartyTaskModel: async () => ({
      find: (filter) => {
        calls.push(filter)
        return {
          select() {
            return this
          },
          lean: async () => tasks,
        }
      },
    }),
  }
  const helper = new Function(
    ...Object.keys(deps),
    `${summarySource}\nreturn withPartyOrderTaskSummaries`
  )(...Object.values(deps))
  return {
    calls,
    run: (orders = [order]) =>
      helper({ context: actor, orders, now: new Date('2026-10-27T10:00:00Z') }),
  }
}

test('task summaries never expose titles of another assignee, location or company', async () => {
  const actor = {
    ...context,
    position: {
      ...context.position,
      orderScope: { locationIds: ['own-venue'], includeUnlocated: false },
    },
  }
  const instance = setup(
    [
      task('Разрешённая задача', { dueAt: '2026-10-26T10:00:00Z' }),
      task('Секрет другого сотрудника', {
        assigneeStaffIds: ['other-staff'],
        dueAt: '2026-10-20T10:00:00Z',
      }),
      task('Секрет другой площадки', {
        locationId: 'other-venue',
        dueAt: '2026-10-19T10:00:00Z',
      }),
      task('Секрет другой компании', {
        tenantId: 'company-b',
        dueAt: '2026-10-18T10:00:00Z',
      }),
      task('Назначено должности', {
        assigneeStaffIds: [],
        assigneeRoleId: positionId,
      }),
      task('Завершено', { status: 'done' }),
    ],
    actor
  )
  const [result] = await instance.run()
  assert.deepEqual(result.taskSummary, {
    openCount: 2,
    overdueCount: 1,
    nearestTask: { title: 'Разрешённая задача', dueAt: '2026-10-26T10:00:00Z' },
  })
  assert.doesNotMatch(JSON.stringify(result.taskSummary), /Секрет|Завершено/)
  assert.deepEqual(instance.calls, [{ tenantId, orderId: { $in: [orderId] } }])
})

test('canonical tasks replace legacy mirrors even when complete, cancelled or reassigned away', async () => {
  const events = [0, 1, 2, 3].map((index) => ({
    _id: `legacy-${index}`,
    title: `Старый заголовок ${index}`,
    date: '2026-10-26T08:00:00Z',
    responsibleStaffId: staffId,
  }))
  const sourceKey = (index) => `order:${orderId}:additional:legacy-${index}`
  const instance = setup([
    task('Каноничная задача', { sourceKey: sourceKey(0) }),
    task('Готовая', { sourceKey: sourceKey(1), status: 'done' }),
    task('Отменённая', { sourceKey: sourceKey(2), status: 'canceled' }),
    task('Переназначена', {
      sourceKey: sourceKey(3),
      assigneeStaffIds: ['other-staff'],
    }),
  ])
  const [result] = await instance.run([
    {
      ...order,
      additionalEvents: [
        ...events,
        { title: 'Ещё не перенесено', date: '2026-10-29T10:00:00Z' },
      ],
    },
  ])
  assert.deepEqual(result.taskSummary, {
    openCount: 2,
    overdueCount: 0,
    nearestTask: { title: 'Каноничная задача', dueAt: '2026-10-28T10:00:00Z' },
  })
})

test('hidden modules or inaccessible orders remove stale summaries without querying tasks', async () => {
  for (const actor of [
    {
      ...context,
      position: { ...context.position, permissions: { orders: 'read' } },
    },
    {
      ...context,
      position: {
        ...context.position,
        orderScope: { stageIds: ['other-stage'] },
      },
    },
  ]) {
    const instance = setup([], actor)
    const [result] = await instance.run([
      { ...order, taskSummary: { nearestTask: { title: 'Старая утечка' } } },
    ])
    assert.equal('taskSummary' in result, false)
    assert.equal(instance.calls.length, 0)
  }
})

test('one batched task query keeps counts separate and handles undated tasks', async () => {
  const otherOrder = { ...order, _id: 'e'.repeat(24) }
  const instance = setup([
    task('Без срока', { dueAt: null }),
    task('Следующий заказ', { orderId: otherOrder._id }),
    task('Неизвестный заказ', { orderId: 'other' }),
  ])
  const result = await instance.run([order, otherOrder])
  assert.equal(instance.calls.length, 1)
  assert.deepEqual(instance.calls[0].orderId.$in, [orderId, otherOrder._id])
  assert.deepEqual(result[0].taskSummary, {
    openCount: 1,
    overdueCount: 0,
    nearestTask: null,
  })
  assert.deepEqual(result[1].taskSummary, {
    openCount: 1,
    overdueCount: 0,
    nearestTask: { title: 'Следующий заказ', dueAt: '2026-10-28T10:00:00Z' },
  })
})
