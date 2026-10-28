import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canPartyTodayAccess,
  getPartyTodayAccess,
  getPartyTodayPeriod,
  projectPartyTodayOrder,
  partyTodayPhone,
} from './partyToday.js'

const tenantId = '1'.repeat(24),
  staffId = '2'.repeat(24),
  roleId = '3'.repeat(24)
const owner = {
  tenantId,
  role: 'owner',
  staff: { _id: staffId, tenantId, role: 'owner', status: 'active' },
  company: {},
}
const role = (permissions = {}, orderScope = {}) => ({
  ...owner,
  role: 'performer',
  staff: { ...owner.staff, role: 'performer', positionId: roleId },
  position: { _id: roleId, tenantId, active: true, permissions, orderScope },
})

test('today access follows membership and field grants, including an intake manager without team or tasks', () => {
  assert.equal(canPartyTodayAccess(owner), true)
  const manager = role({ orders: 'read', 'orders.eventDate': 'read' })
  assert.deepEqual(getPartyTodayAccess(manager), {
    tasks: false,
    inbox: false,
    orders_new: false,
    orders_team: false,
    orders_preparation: false,
    payments: false,
    orders_upcoming: true,
  })
  assert.equal(canPartyTodayAccess(manager), true)
  const stageManager = role({
    orders: 'read',
    'orders.workflowStageId': 'read',
  })
  assert.equal(canPartyTodayAccess(stageManager), true)
  assert.equal(getPartyTodayAccess(stageManager).orders_new, true)
  assert.equal(getPartyTodayAccess(stageManager).orders_upcoming, false)
  assert.equal(canPartyTodayAccess(role()), false)
  assert.equal(
    canPartyTodayAccess({ ...role(), sessionUser: { role: 'admin' } }),
    false
  )
  assert.equal(
    canPartyTodayAccess({
      ...owner,
      staff: { ...owner.staff, tenantId: '9'.repeat(24) },
    }),
    false
  )
  assert.equal(
    canPartyTodayAccess({
      ...owner,
      staff: { ...owner.staff, status: 'archived' },
    }),
    false
  )
})

test('finance requires both price and payment access and legacy inbox does not widen to custom positions', () => {
  assert.equal(
    getPartyTodayAccess(
      role({ orders: 'read', 'finance.clientAmount': 'read' })
    ).payments,
    false
  )
  assert.equal(
    getPartyTodayAccess(role({ orders: 'read', 'finance.payments': 'read' }))
      .payments,
    false
  )
  assert.equal(
    getPartyTodayAccess(
      role({
        orders: 'read',
        'finance.payments': 'read',
        'finance.clientAmount': 'read',
      })
    ).payments,
    true
  )
  assert.equal(getPartyTodayAccess(role({ inbox: 'read' })).inbox, false)
  const admin = role({ inbox: 'read' })
  admin.role = 'admin'
  admin.staff.role = 'admin'
  assert.equal(getPartyTodayAccess(admin).inbox, false)
  assert.equal(getPartyTodayAccess(owner).inbox, true)
})

test('today uses company midnight and exclusive next midnight across date and daylight-saving changes', () => {
  const local = getPartyTodayPeriod({
    now: new Date('2026-10-28T18:00:00Z'),
    timeZone: 'Asia/Krasnoyarsk',
  })
  assert.equal(local.dayFrom.toISOString(), '2026-10-28T17:00:00.000Z')
  assert.equal(local.dayTo.toISOString(), '2026-10-29T17:00:00.000Z')
  assert.equal(local.upcomingTo.toISOString(), '2026-11-04T17:00:00.000Z')
  const clock = getPartyTodayPeriod({
    now: new Date('2026-10-25T10:00:00Z'),
    timeZone: 'Europe/Berlin',
  })
  assert.equal(+clock.dayTo - +clock.dayFrom, 25 * 3600000)
  assert.equal(
    getPartyTodayPeriod({
      timeZone: 'invalid',
      now: new Date('2026-10-28T18:00:00Z'),
    }).timeZone,
    'Europe/Moscow'
  )
})

test('order cards contain only allowed fields and focus identifiers, never notes, amounts or hidden dates', () => {
  const raw = {
    _id: '4'.repeat(24),
    tenantId,
    status: 'active',
    title: 'Секретное название',
    serviceTitle: 'Секретная услуга',
    eventDate: new Date('2026-10-29T10:00:00Z'),
    contractAmount: 999999,
    client: {
      name: 'Секретный клиент',
      phone: '89130000000',
      email: 'secret@example.test',
    },
    adminComment: 'Секретная заметка',
  }
  const safe = projectPartyTodayOrder(
    role({ orders: 'read' }),
    raw,
    'Ожидается аванс'
  )
  assert.equal(safe.title, 'Заказ')
  assert.equal(Object.hasOwn(safe, 'eventDate'), false)
  assert.equal(Object.hasOwn(safe, 'phone'), false)
  assert.equal(Object.hasOwn(safe, 'clientName'), false)
  assert.doesNotMatch(JSON.stringify(safe), /Секрет|999999|secret/)
  assert.equal(
    new URL(safe.href, 'https://example.test').searchParams.get('orderId'),
    raw._id
  )
  const visible = projectPartyTodayOrder(
    role({
      orders: 'read',
      'orders.serviceTitle': 'read',
      'orders.client.phone': 'read',
    }),
    raw,
    'Проверить'
  )
  assert.equal(visible.title, raw.serviceTitle)
  assert.equal(visible.phone, '79130000000')
  assert.equal(
    projectPartyTodayOrder(
      role(
        { orders: 'read' },
        { locationIds: ['5'.repeat(24)], includeUnlocated: false }
      ),
      raw,
      'Проверить'
    ),
    null
  )
})

test('phone shortcuts accept Russian numbers and reject arbitrary URL-like values', () => {
  assert.equal(partyTodayPhone('+7 (913) 000-00-00'), '79130000000')
  assert.equal(partyTodayPhone('89130000000'), '79130000000')
  assert.equal(partyTodayPhone('9130000000'), '79130000000')
  assert.equal(partyTodayPhone('javascript:alert(1)'), '')
  assert.equal(partyTodayPhone('+441234567890'), '')
})
