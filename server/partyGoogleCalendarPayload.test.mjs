import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPartyAdditionalCalendarPayload,
  buildPartyOrderCalendarPayload,
  calculatePartyOrderFinanceSummary,
} from './partyGoogleCalendarPayload.js'

const baseSettings = {
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 30 },
      { method: 'email', minutes: 120 },
      { method: 'sms', minutes: 5 },
      { method: 'popup', minutes: 0 },
    ],
  },
  statusColors: { draft: '8', active: '9', canceled: '11', closed: '10' },
  syncSettings: {
    titleMode: 'eventType_services',
    showDescription: true,
    showClient: true,
    showLocation: true,
    showServices: true,
    showStaff: true,
    showContractSum: true,
    showPayments: true,
    showTransactions: true,
    showPayouts: true,
    showAdditionalEvents: true,
    showNavigationLinks: true,
    showOrderLink: true,
    showStatusIcons: true,
  },
}

const order = {
  _id: 'order-1',
  title: '<b>День рождения</b>',
  status: 'active',
  eventDate: '2026-07-01T12:00:00.000Z',
  dateEnd: '2026-07-01T15:00:00.000Z',
  description: '<p>Основное описание</p>',
  adminComment: 'Комментарий <script>alert(1)</script>',
  client: { name: 'Анна &amp; Иван', phone: '+7 900', email: 'A@EXAMPLE.COM' },
  placeType: 'company_location',
  customAddress: 'Резервный адрес',
  contractAmount: 100000,
  assignedStaff: [
    { staffId: 'staff-1', role: 'performer', payoutAmount: 20000 },
    { staffId: 'staff-2', role: 'assistant', payoutAmount: 5000 },
  ],
  additionalEvents: [
    { title: 'Позвонить клиенту', date: '2026-06-30T10:00:00.000Z', done: false },
    { title: 'Готово', date: '2026-06-29T10:00:00.000Z', done: true },
  ],
}

const transactions = [
  { type: 'income', category: 'deposit', amount: 30000, date: '2026-06-01', paymentMethod: 'cash', comment: 'аванс' },
  { type: 'income', category: 'final_payment', amount: 70000, date: '2026-06-20', paymentMethod: 'transfer' },
  { type: 'expense', category: 'materials', amount: 10000, date: '2026-06-21' },
  { type: 'expense', category: 'payout', amount: 20000, staffId: 'staff-1', date: '2026-06-22' },
]

const context = {
  order,
  settings: baseSettings,
  company: { settings: { timeZone: 'Asia/Krasnoyarsk' } },
  transactions,
  location: {
    title: 'Лофт <i>Центр</i>',
    address: { town: 'Красноярск', street: 'Мира', house: '10', room: 'зал 2' },
  },
  services: [{ _id: 'service-1', title: 'Фокусник' }, { _id: 'service-2', title: 'Шоу' }],
  staff: [{ _id: 'staff-1', name: 'Петр' }, { _id: 'staff-2', name: 'Ольга' }],
  domain: 'https://party.example.com/base',
}

test('calculatePartyOrderFinanceSummary uses real transactions and assigned staff payouts', () => {
  assert.deepEqual(calculatePartyOrderFinanceSummary({ order, transactions }), {
    contractAmount: 100000,
    incomeTotal: 100000,
    expenseTotal: 30000,
    balanceDue: 0,
    margin: 65000,
    hasDeposit: true,
    isFullyPaid: true,
    payoutTotal: 25000,
    paidPayoutTotal: 20000,
    pendingPayoutTotal: 5000,
  })
})

test('buildPartyOrderCalendarPayload supports every title mode', () => {
  const expected = {
    eventType_services: 'День рождения - Фокусник, Шоу',
    services_eventType: 'Фокусник, Шоу - День рождения',
    eventType: 'День рождения',
    services: 'Фокусник, Шоу',
    client_eventType: 'Анна & Иван - День рождения',
  }
  for (const [titleMode, title] of Object.entries(expected)) {
    const payload = buildPartyOrderCalendarPayload({
      ...context,
      settings: { ...baseSettings, syncSettings: { ...baseSettings.syncSettings, titleMode, showStatusIcons: false } },
    })
    assert.equal(payload.summary, title)
  }
})

test('buildPartyOrderCalendarPayload adds status prefixes, finance icons and colors', () => {
  const cases = [
    ['draft', '[ЗАЯВКА] ', '8'],
    ['active', '', '9'],
    ['canceled', '[ОТМЕНЕНО] ', '11'],
    ['closed', '[ЗАКРЫТО] ', '10'],
  ]
  for (const [status, prefix, colorId] of cases) {
    const payload = buildPartyOrderCalendarPayload({ ...context, order: { ...order, status } })
    assert.equal(payload.summary, `${prefix}💰 ✅ День рождения - Фокусник, Шоу`)
    assert.equal(payload.colorId, colorId)
  }
})

test('buildPartyOrderCalendarPayload builds full private plain-text payload', () => {
  const payload = buildPartyOrderCalendarPayload(context)
  assert.deepEqual(payload.start, { dateTime: '2026-07-01T12:00:00.000Z', timeZone: 'Asia/Krasnoyarsk' })
  assert.deepEqual(payload.end, { dateTime: '2026-07-01T15:00:00.000Z', timeZone: 'Asia/Krasnoyarsk' })
  assert.equal(payload.visibility, 'private')
  assert.equal(payload.location, 'Красноярск, Мира, 10, зал 2')
  assert.deepEqual(payload.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 120 }] })
  for (const text of ['Основное описание', 'Комментарий alert(1)', 'Анна & Иван', '+7 900', 'A@EXAMPLE.COM', 'Лофт Центр', 'Фокусник, Шоу', 'Петр (Исполнитель)', 'Ольга (Ассистент)', '100 000', 'Получено: 100 000', 'Остаток: 0', 'Предоплата', 'Материалы', 'Выплачено', 'Позвонить клиенту', 'https://www.google.com/maps/search/?api=1', 'https://party.example.com/company/orders/order-1']) {
    assert.match(payload.description, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(`${payload.summary}\n${payload.description}\n${payload.location}`, /<[^>]+>|javascript:/i)
})

test('field toggles exclude every optional description block and unsafe order links', () => {
  const payload = buildPartyOrderCalendarPayload({
    ...context,
    domain: 'javascript:alert(1)',
    settings: { ...baseSettings, syncSettings: Object.fromEntries(Object.keys(baseSettings.syncSettings).map((key) => [key, key === 'titleMode' ? 'eventType' : false])) },
  })
  assert.equal(payload.description, '')
  assert.equal(payload.location, '')
  assert.equal(payload.summary, 'День рождения')
})

test('dates fall back to one hour and Europe/Moscow, invalid start returns null', () => {
  const payload = buildPartyOrderCalendarPayload({ ...context, company: {}, order: { ...order, dateEnd: 'invalid' } })
  assert.equal(payload.end.dateTime, '2026-07-01T13:00:00.000Z')
  assert.equal(payload.start.timeZone, 'Europe/Moscow')
  assert.equal(buildPartyOrderCalendarPayload({ ...context, order: { ...order, eventDate: 'invalid' } }), null)
})

test('canceled orders disable reminders and client address is a location fallback', () => {
  const payload = buildPartyOrderCalendarPayload({
    ...context,
    location: null,
    order: { ...order, status: 'canceled', placeType: 'client_address', customAddress: '', clientAddress: { town: 'Москва', street: 'Тверская', house: '1' } },
  })
  assert.deepEqual(payload.reminders, { useDefault: false, overrides: [] })
  assert.equal(payload.location, 'Москва, Тверская, 1')
})

test('buildPartyAdditionalCalendarPayload creates sanitized 30 minute event with minimal context', () => {
  const payload = buildPartyAdditionalCalendarPayload({
    item: { title: '<b>Позвонить</b>', description: '<p>Уточнить меню</p>', date: '2026-06-30T10:00:00.000Z' },
    orderContext: { order, location: context.location },
    settings: baseSettings,
    company: context.company,
    domain: 'https://party.example.com',
  })
  assert.equal(payload.summary, 'Позвонить')
  assert.deepEqual(payload.start, { dateTime: '2026-06-30T10:00:00.000Z', timeZone: 'Asia/Krasnoyarsk' })
  assert.deepEqual(payload.end, { dateTime: '2026-06-30T10:30:00.000Z', timeZone: 'Asia/Krasnoyarsk' })
  assert.match(payload.description, /Уточнить меню/)
  assert.match(payload.description, /Заказ: День рождения/)
  assert.match(payload.description, /https:\/\/party\.example\.com\/company\/orders\/order-1/)
  assert.doesNotMatch(payload.description, /100 000|Получено|Остаток|<[^>]+>/)
  assert.equal(payload.visibility, 'private')
})

test('additional payload returns null for invalid dates and rejects unsafe domains', () => {
  assert.equal(buildPartyAdditionalCalendarPayload({ item: { date: 'bad' }, orderContext: { order }, settings: baseSettings, company: {}, domain: 'https://party.example.com' }), null)
  const payload = buildPartyAdditionalCalendarPayload({ item: { title: 'Task', date: '2026-06-30T10:00:00Z' }, orderContext: { order }, settings: baseSettings, company: {}, domain: 'javascript:alert(1)' })
  assert.doesNotMatch(payload.description, /javascript:/i)
})

test('client title mode respects showClient=false and title components remove control whitespace', () => {
  const payload = buildPartyOrderCalendarPayload({
    ...context,
    order: {
      ...order,
      title: '  День\r\n\t рождения\u0000  ',
      client: { ...order.client, name: 'Скрытый\r\nклиент' },
    },
    settings: {
      ...baseSettings,
      syncSettings: {
        ...baseSettings.syncSettings,
        titleMode: 'client_eventType',
        showClient: false,
        showStatusIcons: false,
      },
    },
  })

  assert.equal(payload.summary, 'День рождения')
  assert.doesNotMatch(payload.summary, /Скрытый|[\r\n\u0000-\u001f\u007f]/)
})

test('finance summary separates paid from pending payouts by staff transactions', () => {
  const finance = calculatePartyOrderFinanceSummary({
    order: {
      contractAmount: 0,
      assignedStaff: [
        { staffId: 'staff-1', payoutAmount: 2000 },
        { staffId: 'staff-2', payoutAmount: 3000 },
        { staffId: 'staff-3', payoutAmount: 4000 },
      ],
    },
    transactions: [
      { type: 'expense', category: 'payout', amount: 2000, staffId: 'staff-1' },
      { type: 'expense', category: 'payout', amount: 1000, staffId: 'staff-2' },
    ],
  })

  assert.equal(finance.payoutTotal, 9000)
  assert.equal(finance.paidPayoutTotal, 3000)
  assert.equal(finance.pendingPayoutTotal, 6000)
})

test('invalid IANA timezone falls back to Europe/Moscow', () => {
  const payload = buildPartyOrderCalendarPayload({
    ...context,
    company: { settings: { timeZone: 'Invalid/Timezone' } },
  })

  assert.equal(payload.start.timeZone, 'Europe/Moscow')
  assert.equal(payload.end.timeZone, 'Europe/Moscow')
})

test('malformed collection inputs are treated as empty arrays', () => {
  const malformedOrder = {
    ...order,
    assignedStaff: { invalid: true },
    additionalEvents: { invalid: true },
    transactions: { invalid: true },
  }
  assert.doesNotThrow(() =>
    calculatePartyOrderFinanceSummary({ order: malformedOrder, transactions: { invalid: true } })
  )
  const payload = buildPartyOrderCalendarPayload({
    ...context,
    order: malformedOrder,
    services: { invalid: true },
    staff: { invalid: true },
    transactions: { invalid: true },
  })
  assert.ok(payload)
  assert.doesNotMatch(payload.description, /Исполнители:|Дополнительные события:/)
})

test('additional event summary removes control characters and normalizes whitespace', () => {
  const payload = buildPartyAdditionalCalendarPayload({
    item: {
      title: '  Позвонить\r\n\t клиенту\u0000  ',
      date: '2026-06-30T10:00:00.000Z',
    },
    orderContext: { order },
    settings: baseSettings,
    company: context.company,
    domain: context.domain,
  })

  assert.equal(payload.summary, 'Позвонить клиенту')
  assert.doesNotMatch(payload.summary, /[\r\n\u0000-\u001f\u007f]/)
})
