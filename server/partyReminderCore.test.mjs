import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPartyAdditionalEventReminderPayload,
  collectDueAdditionalEventReminders,
  runPartyAdditionalEventReminderBatch,
} from './partyReminderCore.js'

const company = {
  _id: 'company-1',
  title: 'Праздник 24',
  settings: {
    timeZone: 'Asia/Krasnoyarsk',
    notifications: {
      pushEnabled: true,
      additionalEventsPushTime: '10:00',
    },
  },
}

test('runPartyAdditionalEventReminderBatch waits for company local reminder time', async () => {
  let queriedOrders = false
  const result = await runPartyAdditionalEventReminderBatch({
    now: new Date('2026-06-20T02:59:00.000Z'),
    dependencies: {
      findCompanies: async () => [company],
      findOrders: async () => {
        queriedOrders = true
        return []
      },
      createReminderLog: async () => ({}),
      sendPush: async () => ({ ok: true, sent: 1 }),
    },
  })

  assert.equal(queriedOrders, false)
  assert.equal(result.companiesProcessed, 1)
  assert.equal(result.companiesBeforeReminderTime, 1)
  assert.equal(result.pushesSent, 0)
})

test('runPartyAdditionalEventReminderBatch sends due additionalEvents once per local date', async () => {
  const queries = []
  const logs = []
  const pushes = []
  const result = await runPartyAdditionalEventReminderBatch({
    now: new Date('2026-06-20T03:05:00.000Z'),
    dependencies: {
      findCompanies: async () => [company],
      findOrders: async (query) => {
        queries.push(query)
        return [
          {
            _id: 'order-1',
            title: 'День рождения',
            status: 'active',
            additionalEvents: [
              {
                _id: 'task-overdue',
                title: 'Купить шары',
                date: new Date('2026-06-19T12:00:00.000Z'),
              },
              {
                _id: 'task-today',
                title: 'Позвонить клиенту',
                date: new Date('2026-06-20T05:00:00.000Z'),
              },
              {
                _id: 'task-done',
                title: 'Готово',
                date: new Date('2026-06-20T04:00:00.000Z'),
                done: true,
              },
              {
                _id: 'task-future',
                title: 'Завтра',
                date: new Date('2026-06-21T05:00:00.000Z'),
              },
            ],
          },
          {
            _id: 'order-2',
            title: 'Отмененный заказ',
            status: 'canceled',
            additionalEvents: [
              {
                _id: 'task-canceled',
                title: 'Не отправлять',
                date: new Date('2026-06-20T04:00:00.000Z'),
              },
            ],
          },
        ]
      },
      createReminderLog: async (entry) => {
        logs.push(entry)
        if (entry.additionalEventId === 'task-overdue') {
          const error = new Error('duplicate')
          error.code = 11000
          throw error
        }
        return { _id: `log-${logs.length}` }
      },
      sendPush: async (args) => {
        pushes.push(args)
        return { ok: true, sent: 1 }
      },
    },
  })

  assert.equal(queries.length, 1)
  assert.equal(queries[0].companyId, 'company-1')
  assert.equal(queries[0].dateToExclusive.toISOString(), '2026-06-20T17:00:00.000Z')
  assert.equal(logs.length, 2)
  assert.deepEqual(
    logs.map((item) => [item.orderId, item.additionalEventId, item.reminderType, item.dateKey]),
    [
      ['order-1', 'task-overdue', 'overdue', '2026-06-20'],
      ['order-1', 'task-today', 'today', '2026-06-20'],
    ]
  )
  assert.equal(pushes.length, 1)
  assert.equal(pushes[0].tenantId, 'company-1')
  assert.equal(pushes[0].payload.data.type, 'party_additional_events_reminder')
  assert.equal(pushes[0].payload.data.count, 1)
  assert.equal(result.remindersDue, 2)
  assert.equal(result.remindersDeduped, 1)
  assert.equal(result.remindersSent, 1)
})

test('collectDueAdditionalEventReminders includes upcoming tasks within company reminder window', () => {
  const reminders = collectDueAdditionalEventReminders({
    company: {
      ...company,
      settings: {
        ...company.settings,
        notifications: {
          ...company.settings.notifications,
          additionalEventsReminderDaysBefore: 3,
        },
      },
    },
    now: new Date('2026-06-20T03:05:00.000Z'),
    orders: [
      {
        _id: 'order-upcoming',
        title: 'Выпускной',
        status: 'active',
        additionalEvents: [
          {
            _id: 'task-three-days',
            title: 'Подтвердить реквизит',
            date: new Date('2026-06-23T05:00:00.000Z'),
          },
          {
            _id: 'task-four-days',
            title: 'Не включать',
            date: new Date('2026-06-24T05:00:00.000Z'),
          },
        ],
      },
    ],
  })

  assert.deepEqual(
    reminders.map((item) => [
      item.orderId,
      item.additionalEventId,
      item.reminderType,
      item.dateKey,
    ]),
    [['order-upcoming', 'task-three-days', 'upcoming', '2026-06-20']]
  )
})

test('buildPartyAdditionalEventReminderPayload summarizes overdue and today tasks', () => {
  const payload = buildPartyAdditionalEventReminderPayload({
    company,
    dateKey: '2026-06-20',
    reminders: [
      { reminderType: 'overdue', title: 'Купить шары', orderTitle: 'День рождения' },
      { reminderType: 'today', title: 'Позвонить клиенту', orderTitle: 'День рождения' },
    ],
  })

  assert.equal(payload.title, 'Праздник 24')
  assert.match(payload.body, /2 задачи/)
  assert.match(payload.body, /1 просрочена/)
  assert.equal(payload.tag, 'party-reminders-company-1-2026-06-20')
  assert.equal(payload.data.url, '/company/orders')
  assert.equal(payload.data.count, 2)
  assert.equal(payload.data.overdueCount, 1)
})

test('buildPartyAdditionalEventReminderPayload pluralizes overdue tasks', () => {
  const payload = buildPartyAdditionalEventReminderPayload({
    company,
    dateKey: '2026-06-20',
    reminders: [
      { reminderType: 'overdue', title: 'Купить шары' },
      { reminderType: 'overdue', title: 'Проверить реквизит' },
    ],
  })

  assert.match(payload.body, /2 просрочены/)
})
