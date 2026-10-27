import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '../helpers/partyRolePermissions.js'
import {
  calculatePartyFinancialOverview,
  parsePartyOverviewPeriod,
} from '../helpers/partyFinancialOverview.js'
import { isPartyTicketingEnabled } from '../helpers/partyTicketing.js'

const strip = (value) =>
  value
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
    .replaceAll('export async function ', 'async function ')
const serviceSource = strip(
  await readFile(
    new URL('./partyFinancialOverview.js', import.meta.url),
    'utf8'
  )
)
const ticketSource = strip(
  await readFile(new URL('./partyTicketing.js', import.meta.url), 'utf8')
)
const buildPartyTicketAccessFilter = new Function(
  'canPartyAccess',
  `${ticketSource}\nreturn buildPartyTicketAccessFilter`
)(canPartyAccess)
const tenantId = 'a'.repeat(24),
  locationId = 'b'.repeat(24),
  staffId = 'c'.repeat(24)
const context = {
  tenantId,
  role: 'performer',
  staff: { _id: staffId, tenantId, role: 'performer', status: 'active' },
  company: {
    settings: {
      timeZone: 'Asia/Krasnoyarsk',
      modules: { ticketing: { enabled: true } },
    },
  },
  position: {
    permissions: {
      orders: 'read',
      'finance.payments': 'read',
      tickets: 'read',
      'tickets.finance': 'read',
    },
    orderScope: { locationIds: [locationId], includeUnlocated: false },
  },
}
const q = (value) => ({
  select() {
    return this
  },
  sort() {
    return this
  },
  lean: async () => value,
})
const setup = () => {
  const calls = []
  const deps = {
    canPartyAccess,
    buildPartyOrderAccessFilter,
    buildPartyTicketAccessFilter,
    isPartyTicketingEnabled,
    calculatePartyFinancialOverview,
    parsePartyOverviewPeriod,
    getPartyOrderModel: async () => ({
      find: (filter) => {
        calls.push(['orders', filter])
        return q([
          {
            _id: 'order',
            fulfillment: { performedAt: '2026-10-15', amountKopecks: 999999 },
          },
        ])
      },
    }),
    getPartyTransactionModel: async () => ({
      distinct: async (field, filter) => {
        calls.push(['persisted', filter])
        return ['order']
      },
      find: (filter) => {
        calls.push(['transactions', filter])
        return q([
          { orderId: 'order', amount: 200, type: 'income', date: '2026-10-01' },
        ])
      },
    }),
    getPartyTicketSaleModel: async () => ({
      find: (filter) => {
        calls.push(['sales', filter])
        return q([
          {
            _id: 'sale',
            admission: 'session',
            quantity: 1,
            fulfilledAt: '2026-10-15',
            earnedAmountKopecks: 555,
          },
        ])
      },
    }),
    getPartyTicketLedgerModel: async () => ({
      find: (filter) => {
        calls.push(['ledger', filter])
        return q([
          {
            saleId: 'sale',
            kind: 'payment',
            amountKopecks: 555,
            occurredAt: '2026-10-10',
          },
        ])
      },
    }),
  }
  return {
    calls,
    run: (current = context) =>
      new Function(
        ...Object.keys(deps),
        `${serviceSource}\nreturn getPartyFinancialOverview`
      )(...Object.values(deps))({
        context: current,
        from: '2026-10-01',
        to: '2026-10-31',
      }),
  }
}
test('financial aggregation queries only tenant and position scopes and does not leak ungranted earned order sums', async () => {
  const api = setup(),
    result = await api.run()
  assert.equal(result.orderPaymentsKopecks, 20000)
  assert.equal(result.orderEarnedKopecks, null)
  assert.equal(result.ticketPaymentsKopecks, 555)
  assert.equal(result.ticketEarnedKopecks, 555)
  const calls = Object.fromEntries(api.calls)
  assert.deepEqual(calls.orders, {
    tenantId,
    $and: [{ locationId: { $in: [locationId] } }],
  })
  assert.deepEqual(calls.sales, buildPartyTicketAccessFilter(context))
  assert.deepEqual(calls.transactions.orderId, { $in: ['order'] })
  assert.equal(calls.transactions.tenantId, tenantId)
  assert.deepEqual(calls.ledger.$and.at(-1).saleId, { $in: ['sale'] })
  assert.doesNotMatch(
    JSON.stringify(result),
    /999999|phone|contact|staffId|clientId/
  )
})
test('ticket-only finance never queries ordinary orders; order-only finance never queries ticket history', async () => {
  const ticketOnly = setup()
  await ticketOnly.run({
    ...context,
    position: {
      ...context.position,
      permissions: { tickets: 'read', 'tickets.finance': 'read' },
    },
  })
  assert.deepEqual(
    ticketOnly.calls.map(([name]) => name),
    ['sales', 'ledger']
  )
  const orderOnly = setup()
  await orderOnly.run({
    ...context,
    position: {
      ...context.position,
      permissions: { orders: 'read', 'finance.payments': 'read' },
    },
  })
  assert.ok(
    orderOnly.calls.every(([name]) => !['sales', 'ledger'].includes(name))
  )
})
test('absent grants stop before querying any history; disabled modules preserve existing financial facts', async () => {
  const api = setup()
  await assert.rejects(api.run({ ...context, position: { permissions: {} } }), {
    status: 403,
  })
  assert.equal(api.calls.length, 0)
  const result = await api.run({
    ...context,
    company: { settings: { modules: { ticketing: { enabled: false } } } },
  })
  assert.equal(result.ticketEarnedKopecks, 555)
})

test('earned-service access cannot reveal hidden planned dates through missing-fulfillment counts', async () => {
  const api = setup()
  const result = await api.run({
    ...context,
    position: {
      ...context.position,
      permissions: {
        orders: 'read',
        'finance.clientAmount': 'read',
        'orders.fulfillment': 'read',
      },
    },
  })
  assert.equal(result.access.orderEarned, true)
  assert.equal(result.orderEarnedKopecks, 999999)
  assert.equal(result.access.orderUnmarked, false)
  assert.equal(result.unmarkedPastOrders, null)
})
test('overview route stops at tenant auth and redacts internal failures', async () => {
  const source = strip(
    await readFile(
      new URL('../app/api/party/finance/overview/route.js', import.meta.url),
      'utf8'
    )
  )
  const run = (changes = {}) => {
    const deps = {
      NextResponse: { json: (body) => ({ status: 200, body }) },
      getPartyRequestContext: async () => ({ context }),
      getPartyFinancialOverview: async () => {
        throw Error('secret-database-uri')
      },
      partyError: (status, code, message) => ({ status, code, message }),
      ...changes,
    }
    return new Function(...Object.keys(deps), `${source}\nreturn GET`)(
      ...Object.values(deps)
    )({ url: 'http://local/api?from=2026-10-01&to=2026-10-31' })
  }
  assert.equal(
    (
      await run({
        getPartyRequestContext: async () => ({ error: { status: 401 } }),
      })
    ).status,
    401
  )
  const result = await run()
  assert.equal(result.status, 500)
  assert.doesNotMatch(JSON.stringify(result), /secret/)
})
