// Uses only an owned temporary replica set. Never loads .env or an application URI.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { compileFunction } from 'node:vm'
import mongoose, { Schema, Types } from 'mongoose'
import * as booking from '../helpers/partyOrderBooking.js'
import * as schedules from '../helpers/partyWorkingSchedule.js'
import * as permissions from '../helpers/partyRolePermissions.js'
import * as brief from '../helpers/partyBriefTemplates.js'
import * as expectationHelpers from '../helpers/partyPaymentExpectations.js'
import * as venueHelpers from '../helpers/partyVenueBooking.js'
import * as venueSchemas from '../schemas/partyVenueBookingsSchema.js'
import * as sorting from '../helpers/partyOrderSorting.js'
import * as listHelpers from '../helpers/partyOrderListQuery.js'
import { sharePartyLocationBooking } from '../helpers/partySharedLocationBooking.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { canAccessPartyTransaction } from '../server/partyTransactionAccess.js'
import {
  createPartyVenueBookingService,
  createPartyOrderVenueWriter,
} from '../server/partyVenueBookings.js'
import { getOrderPaymentState } from '../helpers/partyOrderTransactions.js'
import {
  financialError,
  isFinancialId,
} from '../helpers/partyFinancialSettlements.js'
import { migratePartyOrderTypes } from './migratePartyOrderTypes.mjs'

const root = new URL('../', import.meta.url)
const compile = async (file, deps, result) => {
  const source = (await readFile(new URL(file, root), 'utf8'))
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
    .replaceAll('export async function ', 'async function ')
  return compileFunction(`${source}\nreturn ${result}`, Object.keys(deps), {
    filename: file,
  })(...Object.values(deps))
}
const port = await new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(() => resolve(port))
  })
})
const directory = await mkdtemp(
  path.join(os.tmpdir(), 'partycrm-booking-mongo-')
)
const binary =
  process.env.MONGOD_BINARY ||
  (process.platform === 'win32'
    ? 'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe'
    : 'mongod')
const child = spawn(
  binary,
  [
    '--dbpath',
    directory,
    '--port',
    String(port),
    '--bind_ip',
    '127.0.0.1',
    '--replSet',
    'partycrm_booking_test',
    '--logpath',
    path.join(directory, 'mongod.log'),
  ],
  { windowsHide: true, stdio: 'ignore' }
)
let startError,
  connection,
  passed = 0
child.once('error', (error) => {
  startError = error
})
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const check = async (name, run) => {
  await run()
  passed++
  console.log(`PASS ${name}`)
}
try {
  const uri = `mongodb://127.0.0.1:${port}/partycrm_booking_test?directConnection=true`
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startError) throw startError
    try {
      connection = await mongoose
        .createConnection(uri, { serverSelectionTimeoutMS: 300 })
        .asPromise()
      break
    } catch {
      await delay(200)
    }
  }
  if (!connection) throw Error('Temporary mongod did not become ready')
  await connection.db
    .admin()
    .command({
      replSetInitiate: {
        _id: 'partycrm_booking_test',
        members: [{ _id: 0, host: `127.0.0.1:${port}` }],
      },
    })
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await connection.db.admin().command({ hello: 1 })).isWritablePrimary)
      break
    if (attempt === 99) throw Error('No primary')
    await delay(200)
  }
  const getProductModel = async ({
    name,
    collectionName,
    schemaDefinition,
    schemaOptions,
    configureSchema,
  }) => {
    if (connection.models[name]) return connection.models[name]
    const schema = new Schema(schemaDefinition, schemaOptions)
    configureSchema?.(schema)
    return connection.model(name, schema, collectionName)
  }
  const schemaNames = [
    'partyCompaniesSchema',
    'partyClientsSchema',
    'partyLocationsSchema',
    'partyOrdersSchema',
    'partyServicesSchema',
    'partyTransactionsSchema',
    'partyOrderTypesSchema',
    'partyPaymentExpectationsSchema',
  ]
  const schemas = Object.fromEntries(
    await Promise.all(
      schemaNames.map(async (name) => [
        name,
        (await import(new URL(`schemas/${name}.js`, root))).default,
      ])
    )
  )
  const base = { Schema, PRODUCTS: { PARTYCRM: 'partycrm' }, getProductModel }
  const getters = await compile(
    'server/partyModels.js',
    { ...base, ...schemas },
    '{getPartyCompanyModel,getPartyClientModel,getPartyLocationModel,getPartyOrderModel,getPartyServiceModel,getPartyTransactionModel,getPartyOrderTypeModel,getPartyPaymentExpectationModel}'
  )
  const models = Object.fromEntries(
    await Promise.all(
      Object.entries(getters).map(async ([key, get]) => [key, await get()])
    )
  )
  const [
    Companies,
    Clients,
    Locations,
    Orders,
    Services,
    Transactions,
    OrderTypes,
    Expectations,
  ] = [
    'Company',
    'Client',
    'Location',
    'Order',
    'Service',
    'Transaction',
    'OrderType',
    'PaymentExpectation',
  ].map((name) => models[`getParty${name}Model`])
  const venueGetters = await compile(
    'server/partyVenueBookingModels.js',
    { ...base, ...venueSchemas },
    '{getPartyVenueBookingModel,getPartyVenueLockModel}'
  )
  const Bookings = await venueGetters.getPartyVenueBookingModel(),
    Locks = await venueGetters.getPartyVenueLockModel()
  const getLock = await compile(
    'server/partyFinancialModels.js',
    base,
    'getPartyFinancialLockModel'
  )
  const withPartyFinancialTransaction = await compile(
    'server/partyFinancialSettlements.js',
    { getPartyFinancialLockModel: getLock, financialError, isFinancialId },
    'withPartyFinancialTransaction'
  )
  const modelGetters = Object.fromEntries(
    Object.entries(models).map(([key, Model]) => [key, async () => Model])
  )
  const venueService = createPartyVenueBookingService({
    getModels: async () => ({ Locations, Orders, Companies, Bookings, Locks }),
  })
  const venueWrite = createPartyOrderVenueWriter({
    getModels: async () => ({ Locations, Companies }),
    supportsTransactions: async () => true,
    withVenueMutation: venueService.withPartyVenueMutation,
    reserveVenue: venueService.reservePartyVenue,
  })
  const effects = []
  let gateBlocked = false
  const financial = await compile(
    'server/partyPaymentExpectations.js',
    {
      ...modelGetters,
      ...permissions,
      ...booking,
      ...expectationHelpers,
      createHash,
      parsePartyIsoDate,
      canAccessPartyTransaction,
      withPartyFinancialTransaction,
      syncPartyOrderCalendarAfterCrud: async () => effects.push('calendar'),
      recordPartyOrderAudit: async () => effects.push('audit'),
      assertPartyReportGate: async () => {
        if (gateBlocked) booking.partyBookingFailure('Report required', 409)
      },
    },
    '{createPartyPaymentExpectation,mutatePartyPaymentExpectation,insertPartyInitialExpectations,listPartyOrderExpectations}'
  )
  const createModule = await compile(
    'server/partyOrderCreatePayment.js',
    {
      ...modelGetters,
      ...permissions,
      createHash,
      parsePartyIsoDate,
      withPartyFinancialTransaction,
      withPartyOrderVenueWrite: venueWrite,
      supportsPartyVenueTransactions: async () => true,
    },
    '{createPartyOrderPaymentService,buildPartyOrderCreateIdentity}'
  )
  const createService = createModule.createPartyOrderPaymentService({
    getOrders: modelGetters.getPartyOrderModel,
    getTransactions: modelGetters.getPartyTransactionModel,
    getExpectations: modelGetters.getPartyPaymentExpectationModel,
    insertExpectations: financial.insertPartyInitialExpectations,
  })
  const briefSchema = (
    await import(new URL('schemas/partyBriefTemplatesSchema.js', root))
  ).default
  const briefService = await compile(
    'server/partyBriefTemplates.js',
    {
      ...base,
      ...modelGetters,
      ...permissions,
      ...brief,
      partyBriefTemplatesSchema: briefSchema,
      isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value)),
    },
    '{getPartyBriefTemplateModel,getPartyBriefTemplate,getPartyBriefTemplateForOrder,publishPartyBriefTemplate,snapshotPartyBriefForClose}'
  )
  const typeHelpers = await compile(
    'server/partyOrderTypes.js',
    { ...modelGetters, ...booking },
    '{ensurePartyOrderTypes,normalizePartyOrderTypeTitle}'
  )
  const prepare = await compile(
    'server/partyOrderBooking.js',
    {
      ...modelGetters,
      ...booking,
      ...schedules,
      ...brief,
      ...briefService,
      ...typeHelpers,
    },
    'preparePartyOrderBooking'
  )
  const availability = await compile(
    'server/partyBookingAvailability.js',
    {
      ...modelGetters,
      ...permissions,
      ...venueHelpers,
      ...schedules,
      ...booking,
      ...venueGetters,
      sharePartyLocationBooking,
    },
    'loadPartyBookingAvailability'
  )
  const invitations = await compile(
    'server/partyInvitations.js',
    { ...base, ...modelGetters, ...permissions, ...booking, randomBytes },
    '{getPartyInvitationTemplateModel,getPartyInvitationModel,savePartyOrderInvitation,getPublicPartyInvitation}'
  )
  await Promise.all(
    [
      ...Object.values(models),
      Bookings,
      Locks,
      await getLock(),
      await briefService.getPartyBriefTemplateModel(),
      await briefService.getPartyBriefTemplateModel(true),
      await invitations.getPartyInvitationTemplateModel(),
      await invitations.getPartyInvitationModel(),
    ].map((Model) => Model.init())
  )
  const tenantId = new Types.ObjectId(),
    staffId = new Types.ObjectId(),
    foreignTenantId = new Types.ObjectId()
  const schedule = {
    week: Array.from({ length: 7 }, () => ({
      closed: false,
      opens: '09:00',
      closes: '21:00',
    })),
    exceptions: [],
  }
  const company = await Companies.create({
    _id: tenantId,
    tenantId,
    title: 'Тестовая компания',
    settings: {
      timeZone: 'Asia/Krasnoyarsk',
      workingSchedule: schedule,
      orderTypes: ['День рождения'],
    },
  })
  const context = {
    tenantId: String(tenantId),
    role: 'owner',
    staff: {
      _id: String(staffId),
      tenantId: String(tenantId),
      role: 'owner',
      status: 'active',
    },
    company: company.toObject(),
  }
  const location = await Locations.create({
    tenantId,
    title: 'Зал',
    preparationMinutes: 15,
    cleanupMinutes: 15,
    hourlyRentalRate: 1000,
  })
  const client = await Clients.create({
    tenantId,
    firstName: 'Внутреннее имя',
    phone: '79991234567',
  })
  await typeHelpers.ensurePartyOrderTypes(context.company)
  const type = await OrderTypes.findOne({ tenantId }).lean()
  const service = await Services.create({
    tenantId,
    title: 'Программа',
    price: 1000,
    duration: 30,
    repeatable: true,
    maxQuantity: 3,
    includedRentalMinutes: 15,
    availabilityConfigured: true,
    orderTypeIds: [type._id],
    locationIds: [location._id],
    offsiteAllowed: true,
  })
  const at = (time, date = '2026-11-04') =>
    schedules.partyDateAtTime(date, time, 'Asia/Krasnoyarsk').toISOString()
  const emptyPayload = {
    status: 'draft',
    title: '',
    servicesIds: [],
    orderItems: [],
    assignedStaff: [],
    transactions: [],
    eventBrief: {},
    client: {},
    clientPayment: {},
    locationId: location._id,
    placeType: 'company_location',
  }
  const request = () => ({
    headers: new Headers({ 'Idempotency-Key': randomUUID() }),
  })
  const expectationBody = (orderId, amount = 100) => ({
    orderId: String(orderId),
    type: 'income',
    category: 'deposit',
    amount,
    paymentMethod: 'transfer',
    dueAt: at('20:00'),
    comment: 'Тест',
  })
  const newOrder = async (extra = {}) =>
    Orders.create({
      tenantId,
      title: 'Заказ',
      status: 'active',
      contractAmount: 1000,
      ...extra,
    })
  const fulfill = (record, amount, req = request()) =>
    financial.mutatePartyPaymentExpectation({
      context,
      req,
      expectationId: record._id,
      body: { action: 'fulfill', amount, expectedRevision: record.revision },
    })

  await check(
    'catalog constraints, repeat snapshots, separate rent and exact agreed total',
    async () => {
      const body = {
        bookingVersion: 1,
        orderTypeId: String(type._id),
        serviceSelections: [{ serviceId: String(service._id), quantity: 2 }],
        eventDate: at('12:00'),
        rental: { startsAt: at('11:30'), endsAt: at('14:00') },
        discount: { type: 'amount', value: 100 },
      }
      const payload = await prepare({
        context,
        body,
        payload: {
          ...emptyPayload,
          eventDate: body.eventDate,
          clientId: client._id,
        },
      })
      assert.equal(payload.durationMinutes, 60)
      assert.equal(payload.dateEnd.toISOString(), at('13:00'))
      assert.equal(payload.contractAmount, 3900)
      assert.equal(payload.pricingSnapshot.billedHours, 2)
      await assert.rejects(
        prepare({
          context,
          body: {
            ...body,
            serviceSelections: [
              { serviceId: String(service._id), quantity: 4 },
            ],
          },
          payload: emptyPayload,
        }),
        { status: 400 }
      )
      const foreign = await Services.create({
        tenantId: foreignTenantId,
        title: 'Чужая услуга',
      })
      await assert.rejects(
        prepare({
          context,
          body: {
            ...body,
            serviceSelections: [
              { serviceId: String(foreign._id), quantity: 1 },
            ],
          },
          payload: emptyPayload,
        }),
        { status: 400 }
      )
      await Services.updateOne(
        { _id: service._id, tenantId },
        { $set: { price: 9999, duration: 90 } }
      )
      const old = { ...payload, tenantId, _id: new Types.ObjectId() }
      const saved = await prepare({
        context,
        body: { eventBrief: {} },
        payload: old,
        previous: old,
      })
      assert.equal(saved.orderItems[0].unitPrice, 1000)
      assert.equal(saved.durationMinutes, 60)
      await Services.updateOne(
        { _id: service._id, tenantId },
        { $set: { price: 1000, duration: 30 } }
      )
    }
  )
  await check(
    'rental occupation blocks orders before and after the program, with ticket buffers',
    async () => {
      const order = await newOrder({
        locationId: location._id,
        placeType: 'company_location',
        eventDate: at('12:00'),
        dateEnd: at('13:00'),
        rental: { startsAt: at('11:00'), endsAt: at('15:00') },
      })
      await assert.rejects(
        venueService.checkPartyVenueAvailability({
          tenantId,
          locationId: location._id,
          startsAt: at('10:30'),
          endsAt: at('11:00'),
        }),
        { status: 409 }
      )
      await assert.rejects(
        venueService.checkPartyVenueAvailability({
          tenantId,
          locationId: location._id,
          startsAt: at('14:00'),
          endsAt: at('14:30'),
        }),
        { status: 409 }
      )
      await Orders.deleteOne({ _id: order._id, tenantId })
      const sourceId = new Types.ObjectId()
      await venueService.withPartyVenueMutation({
        tenantId,
        bookings: [
          {
            locationId: location._id,
            startsAt: at('12:00'),
            endsAt: at('13:00'),
          },
        ],
        work: ({ session }) =>
          venueService.reservePartyVenue({
            tenantId,
            sourceType: 'ticket_session',
            sourceId,
            locationId: location._id,
            startsAt: at('12:00'),
            endsAt: at('13:00'),
            capacity: 5,
            status: 'scheduled',
            session,
          }),
      })
      const slots = await availability({
        context,
        body: {
          placeType: 'company_location',
          locationId: String(location._id),
          dateFrom: '2026-11-04',
          durationMinutes: 60,
        },
      })
      assert.equal(
        slots.days[0].slots.some((slot) => slot.startsAt === at('12:00')),
        false
      )
      assert.equal(JSON.stringify(slots).includes('Внутреннее имя'), false)
      await Bookings.deleteMany({ tenantId })
    }
  )
  await check(
    'order, actual advance, expectations and venue commit atomically and retry once',
    async () => {
      const payload = {
        ...emptyPayload,
        title: type.title,
        orderTypeId: type._id,
        bookingVersion: 1,
        eventDate: at('12:00'),
        dateEnd: at('13:00'),
        rental: { startsAt: at('11:30'), endsAt: at('14:00') },
        clientId: client._id,
        contractAmount: 1000,
        clientPayment: {},
      }
      const payment = { amount: 100, paymentMethod: 'cash' }
      const identity = createModule.buildPartyOrderCreateIdentity({
        key: randomUUID(),
        context,
        body: { payload, payment },
      })
      const expectations = [
        expectationHelpers.normalizePartyPaymentExpectation(
          expectationBody('unused', 500)
        ),
      ]
      const args = {
        context,
        identity,
        payment,
        expectations,
        payload,
        checkConflicts: async () => {},
      }
      const results = await Promise.all([
        createService.create(args),
        createService.create(args),
      ])
      const id = results[0].order._id
      assert.equal(String(id), String(results[1].order._id))
      assert.equal(results.filter((value) => value.replayed).length, 1)
      assert.equal(
        await Transactions.countDocuments({ tenantId, orderId: id }),
        1
      )
      assert.equal(
        await Expectations.countDocuments({ tenantId, orderId: id }),
        1
      )
      assert.equal(await Bookings.countDocuments({ tenantId, sourceId: id }), 1)
      const before = await Orders.countDocuments({ tenantId })
      const failed = createModule.createPartyOrderPaymentService({
        getOrders: modelGetters.getPartyOrderModel,
        getTransactions: async () => ({
          create: async () => {
            throw Error('Injected failure')
          },
        }),
        getExpectations: modelGetters.getPartyPaymentExpectationModel,
        insertExpectations: financial.insertPartyInitialExpectations,
      })
      const broken = {
        ...args,
        identity: createModule.buildPartyOrderCreateIdentity({
          key: randomUUID(),
          context,
          body: 'failure',
        }),
        payload: {
          ...payload,
          eventDate: at('17:00'),
          dateEnd: at('18:00'),
          rental: { startsAt: at('16:30'), endsAt: at('18:30') },
        },
      }
      await assert.rejects(failed.create(broken), /Injected failure/)
      assert.equal(await Orders.countDocuments({ tenantId }), before)
      assert.equal(await Bookings.countDocuments({ tenantId }), 1)
      await Orders.deleteMany({ tenantId })
      await Transactions.deleteMany({ tenantId })
      await Expectations.deleteMany({ tenantId })
      await Bookings.deleteMany({ tenantId })
    }
  )
  await check(
    'two competing creations cannot double book the same room',
    async () => {
      const payload = {
        ...emptyPayload,
        title: 'Бронь',
        eventDate: at('12:00'),
        dateEnd: at('13:00'),
        rental: { startsAt: at('11:30'), endsAt: at('14:00') },
        contractAmount: 1000,
      }
      const run = () =>
        createService.create({
          context,
          identity: createModule.buildPartyOrderCreateIdentity({
            key: randomUUID(),
            context,
            body: payload,
          }),
          payload,
          payment: null,
          checkConflicts: async () => {},
        })
      const results = await Promise.allSettled([run(), run()])
      assert.equal(
        results.filter((row) => row.status === 'fulfilled').length,
        1
      )
      assert.equal(
        results.find((row) => row.status === 'rejected').reason.status,
        409
      )
      await Orders.deleteMany({ tenantId })
      await Bookings.deleteMany({ tenantId })
    }
  )
  await check(
    'pending promises are not money; concurrent retry records only one partial receipt',
    async () => {
      const order = await newOrder()
      const record = await financial.createPartyPaymentExpectation({
        context,
        req: request(),
        body: expectationBody(order._id),
      })
      assert.equal(
        await Transactions.countDocuments({ tenantId, orderId: order._id }),
        0
      )
      const req = request()
      const results = await Promise.all([
        fulfill(record, 30.01, req),
        fulfill(record, 30.01, req),
      ])
      assert.equal(results[0].remaining, 69.99)
      assert.equal(results[1].remaining, 69.99)
      const ledger = await Transactions.find({
        tenantId,
        orderId: order._id,
      }).lean()
      assert.equal(ledger.length, 1)
      assert.equal(ledger[0].amount, 30.01)
      assert.equal(
        getOrderPaymentState({ contractAmount: 1000, transactions: ledger })
          .balanceDue,
        969.99
      )
      assert.equal(
        (await Orders.findById(order._id).lean()).hasPaymentExpectations,
        true
      )
    }
  )
  await check(
    'canceling an unpaid remainder retains real money and does not become overdue',
    async () => {
      const order = await newOrder()
      const initial = await financial.createPartyPaymentExpectation({
        context,
        req: request(),
        body: expectationBody(order._id),
      })
      const partial = await fulfill(initial, 30)
      const canceled = await financial.mutatePartyPaymentExpectation({
        context,
        req: request(),
        expectationId: initial._id,
        body: { action: 'cancel', expectedRevision: partial.revision },
      })
      assert.equal(canceled.status, 'canceled')
      assert.equal(canceled.paid, 30)
      assert.equal(canceled.remaining, 70)
      assert.equal(canceled.overdue, false)
      assert.equal(
        await Transactions.countDocuments({ tenantId, orderId: order._id }),
        1
      )
    }
  )
  await check(
    'overpayment, stale revision, foreign tenant and revoked finance permission reject without writes',
    async () => {
      const order = await newOrder()
      const record = await financial.createPartyPaymentExpectation({
        context,
        req: request(),
        body: expectationBody(order._id),
      })
      await assert.rejects(fulfill(record, 100.01), { status: 400 })
      const partial = await fulfill(record, 10)
      await assert.rejects(fulfill(record, 10), { status: 409 })
      const foreign = {
        ...context,
        tenantId: String(foreignTenantId),
        staff: { ...context.staff, tenantId: String(foreignTenantId) },
      }
      await assert.rejects(
        financial.mutatePartyPaymentExpectation({
          context: foreign,
          req: request(),
          expectationId: record._id,
          body: {
            action: 'fulfill',
            amount: 10,
            expectedRevision: partial.revision,
          },
        }),
        { status: 404 }
      )
      const restricted = {
        ...context,
        role: 'performer',
        staff: { ...context.staff, role: 'performer' },
        position: { permissions: { orders: 'read' }, orderScope: {} },
      }
      await assert.rejects(
        financial.mutatePartyPaymentExpectation({
          context: restricted,
          req: request(),
          expectationId: record._id,
          body: {
            action: 'fulfill',
            amount: 10,
            expectedRevision: partial.revision,
          },
        }),
        { status: 403 }
      )
      assert.equal(
        await Transactions.countDocuments({ tenantId, orderId: order._id }),
        1
      )
    }
  )
  await check(
    'legacy embedded ledgers and required payout reports cannot be bypassed',
    async () => {
      const legacy = await newOrder({
        transactions: [{ type: 'income', amount: 50 }],
      })
      const promise = await financial.createPartyPaymentExpectation({
        context,
        req: request(),
        body: expectationBody(legacy._id),
      })
      await assert.rejects(fulfill(promise, 10), { status: 409 })
      const order = await newOrder({ assignedStaff: [{ staffId }] })
      const payout = await financial.createPartyPaymentExpectation({
        context,
        req: request(),
        body: {
          ...expectationBody(order._id),
          type: 'expense',
          category: 'payout',
          staffId: String(staffId),
        },
      })
      gateBlocked = true
      await assert.rejects(fulfill(payout, 10), { status: 409 })
      gateBlocked = false
      assert.equal(
        await Transactions.countDocuments({ tenantId, orderId: order._id }),
        0
      )
      assert.equal(
        (await Expectations.findById(payout._id).lean()).paidKopecks,
        0
      )
    }
  )
  await check(
    'type briefs stay independent; notes are optional and closed orders retain snapshots',
    async () => {
      const second = await OrderTypes.create({
        tenantId,
        title: 'Шоу',
        normalizedTitle: 'шоу',
      })
      const field = {
        id: 'question',
        label: 'Пожелания',
        type: 'text',
        required: true,
      }
      const archiveDefaults = async (id) =>
        Object.fromEntries(
          (await briefService.getPartyBriefTemplate(tenantId, id)).fields.map(
            (entry) => [entry.id, 'archive']
          )
        )
      await briefService.publishPartyBriefTemplate({
        context,
        body: {
          orderTypeId: String(type._id),
          title: 'День рождения',
          expectedRevision: 0,
          removedFieldPolicy: await archiveDefaults(type._id),
          fields: [
            field,
            {
              id: 'note',
              label: 'Памятка',
              type: 'note',
              required: true,
              content: 'Позвонить заранее',
            },
          ],
        },
      })
      await briefService.publishPartyBriefTemplate({
        context,
        body: {
          orderTypeId: String(second._id),
          title: 'Шоу',
          expectedRevision: 0,
          removedFieldPolicy: await archiveDefaults(second._id),
          fields: [{ ...field, id: 'other', label: 'Другой вопрос' }],
        },
      })
      const order = await newOrder({
        orderTypeId: type._id,
        eventBrief: { customAnswers: { question: 'Не терять' } },
      })
      const frozen = await briefService.snapshotPartyBriefForClose({
        tenantId,
        order: order.toObject(),
      })
      assert.equal(frozen.templateSnapshot.fields[1].required, false)
      assert.equal(
        (await briefService.getPartyBriefTemplate(tenantId, second._id))
          .fields[0].id,
        'other'
      )
      assert.equal(
        (
          await briefService.getPartyBriefTemplateForOrder({
            tenantId,
            order: {
              ...order.toObject(),
              status: 'closed',
              eventBrief: frozen,
            },
          })
        ).fields[0].id,
        'question'
      )
    }
  )
  await check(
    'compound sorting pages beyond 120 with ties and undated records last in either direction',
    async () => {
      const tag = 'sorting-test'
      const rows = Array.from({ length: 155 }, (_, index) => ({
        tenantId,
        title: tag,
        contractAmount: index % 5,
        eventDate:
          index % 7 === 0
            ? null
            : new Date(+new Date(at('12:00')) + (index % 3) * 60000),
      }))
      await Orders.insertMany(rows)
      const loadPage = await compile(
        'server/partyOrderListPage.js',
        {
          ...listHelpers,
          ...sorting,
          withPartyOrderTaskSummaries: async ({ orders }) => orders,
        },
        'loadPartyOrderListPage'
      )
      for (const sortBy of [
        'event_asc',
        'event_desc',
        'amount_asc',
        'amount_desc',
        'created_asc',
      ]) {
        const found = []
        let cursor = null
        do {
          const list = listHelpers.parsePartyOrderListQuery(
            new URLSearchParams({
              view: 'list',
              sortBy,
              ...(cursor ? { listCursor: cursor } : {}),
            }),
            context
          )
          const page = await loadPage({
            context,
            list,
            accessFilter: { tenantId, title: tag },
            findOrders: (filter, sort, limit) => {
              const query = Orders.find(filter)
              query.cast(Orders)
              return Orders.aggregate([
                { $addFields: sorting.partyOrderSortFields(list.sorting) },
                { $match: query.getFilter() },
                { $sort: sort },
                { $limit: limit },
              ])
            },
          })
          found.push(...page.orders)
          cursor = page.meta.nextCursor
        } while (cursor)
        assert.equal(found.length, 155)
        assert.equal(new Set(found.map((row) => String(row._id))).size, 155)
        if (sortBy.startsWith('event')) {
          const firstNull = found.findIndex((row) => row.eventDate == null)
          assert.ok(
            found.slice(firstNull).every((row) => row.eventDate == null)
          )
        }
      }
    }
  )
  await check(
    'public invitation is whitelisted, follows saved timing, and revoked links stay invalid',
    async () => {
      const order = await newOrder({
        title: 'День рождения',
        clientId: client._id,
        client: { name: 'Скрыто', phone: '79990000000' },
        adminComment: 'Секрет',
        eventBrief: { wishes: 'Скрытый бриф' },
        locationId: location._id,
        placeType: 'company_location',
        eventDate: at('12:00'),
        dateEnd: at('13:00'),
      })
      const published = await invitations.savePartyOrderInvitation({
        context,
        orderId: String(order._id),
        body: { action: 'publish' },
      })
      const token = published.url.split('/').at(-1)
      const publicData = await invitations.getPublicPartyInvitation(token)
      assert.equal(publicData.eventDate, at('12:00'))
      assert.doesNotMatch(
        JSON.stringify(publicData),
        /Скрыто|Секрет|79990000000|contractAmount|clientId|eventBrief/
      )
      await Orders.updateOne(
        { _id: order._id, tenantId },
        { $set: { eventDate: at('14:00') } }
      )
      assert.equal(
        (await invitations.getPublicPartyInvitation(token)).eventDate,
        at('14:00')
      )
      const revoked = await invitations.savePartyOrderInvitation({
        context,
        orderId: String(order._id),
        body: { action: 'unpublish', expectedRevision: published.revision },
      })
      assert.equal(await invitations.getPublicPartyInvitation(token), null)
      const republished = await invitations.savePartyOrderInvitation({
        context,
        orderId: String(order._id),
        body: { action: 'publish', expectedRevision: revoked.revision },
      })
      assert.notEqual(republished.url, published.url)
      await Orders.updateOne(
        { _id: order._id, tenantId },
        { $set: { status: 'canceled' } }
      )
      assert.equal(
        await invitations.getPublicPartyInvitation(
          republished.url.split('/').at(-1)
        ),
        null
      )
    }
  )
  await check(
    'type migration is repeatable and never converts arbitrary historical titles',
    async () => {
      const exact = await newOrder({
        title: '  День   рождения ',
        contractAmount: 123.45,
      })
      const arbitrary = await newOrder({
        title: 'Индивидуальный праздник Василия',
      })
      const dryRun = await migratePartyOrderTypes({
        db: connection.db,
        companyId: String(tenantId),
        onProgress() {},
      })
      assert.ok(dryRun.ordersToLink > 0)
      assert.equal((await Orders.findById(exact._id).lean()).orderTypeId, null)
      await migratePartyOrderTypes({
        db: connection.db,
        apply: true,
        companyId: String(tenantId),
        onProgress() {},
      })
      const saved = await Orders.findById(exact._id).lean()
      assert.equal(String(saved.orderTypeId), String(type._id))
      assert.equal(saved.title, exact.title)
      assert.equal(saved.contractAmount, 123.45)
      assert.equal(
        (await Orders.findById(arbitrary._id).lean()).orderTypeId,
        null
      )
      assert.equal(
        (
          await migratePartyOrderTypes({
            db: connection.db,
            apply: true,
            companyId: String(tenantId),
            onProgress() {},
          })
        ).ordersToLink,
        0
      )
      await OrderTypes.updateOne(
        { _id: type._id },
        { $set: { title: 'Праздник', normalizedTitle: 'праздник' } }
      )
      await typeHelpers.ensurePartyOrderTypes(context.company)
      assert.equal(
        await OrderTypes.countDocuments({
          tenantId,
          normalizedTitle: 'день рождения',
        }),
        0
      )
      await OrderTypes.updateOne(
        { _id: type._id },
        { $set: { title: 'День рождения', normalizedTitle: 'день рождения' } }
      )
    }
  )
  await check(
    'entry and venue reconfiguration honor rental continuing after program end',
    async () => {
      const future = (time) => at(time, '2027-12-01')
      const rentalOrder = await newOrder({
        placeType: 'company_location',
        locationId: location._id,
        eventDate: future('10:00'),
        dateEnd: future('11:00'),
        rental: { startsAt: future('09:00'), endsAt: future('15:00') },
      })
      const currentVenue = createPartyVenueBookingService({
        getModels: async () => ({ Locations, Orders, Companies, Bookings, Locks }),
        now: () => +new Date(future('14:00')),
      })
      await assert.rejects(
        currentVenue.withPartyVenueMutation({
          tenantId,
          locationIds: [location._id],
          work: ({ session }) =>
            currentVenue.assertPartyVenueEntryAllowed({
              tenantId,
              locationId: location._id,
              at: future('14:00'),
              session,
            }),
        }),
        { code: 'partycrm_venue_entry_blocked' }
      )
      await Bookings.create({
        tenantId,
        locationId: location._id,
        sourceType: 'ticket_session',
        sourceId: new Types.ObjectId(),
        startsAt: future('16:00'),
        endsAt: future('17:00'),
        occupiedFrom: future('15:45'),
        occupiedUntil: future('17:15'),
        capacity: 1,
      })
      await assert.rejects(
        currentVenue.updatePartyVenueConfiguration({
          tenantId,
          locationId: location._id,
          patch: { preparationMinutes: 120 },
        }),
        { code: 'partycrm_venue_configuration_conflict' }
      )
      await Orders.deleteOne({ _id: rentalOrder._id, tenantId })
    }
  )
  await check('a changed working schedule rejects the prepared booking and rolls back money', async () => {
    const body = { bookingVersion: 1, orderTypeId: String(type._id), placeType: 'company_location', locationId: String(location._id), serviceSelections: [{ serviceId: String(service._id), quantity: 1 }], eventDate: at('10:00', '2027-12-03'), rental: { startsAt: at('10:00', '2027-12-03'), endsAt: at('11:00', '2027-12-03') } }
    const payload = await prepare({ context, body, payload: emptyPayload })
    const count = async () => Promise.all([Orders, Transactions, Expectations, Bookings].map((Model) => Model.countDocuments({ tenantId })))
    const before = await count()
    try {
      await Locations.updateOne({ _id: location._id, tenantId }, { $set: { workingSchedule: { ...schedule, week: schedule.week.map((day) => ({ ...day, closed: true })) } } })
      await assert.rejects(createService.create({ context, payload, payment: { amount: 100, paymentMethod: 'cash' }, expectations: [], identity: createModule.buildPartyOrderCreateIdentity({ key: randomUUID(), context, body }), checkConflicts: async () => {} }), { code: 'partycrm_booking_schedule_changed' })
      assert.deepEqual(await count(), before)
    } finally {
      await Locations.updateOne({ _id: location._id, tenantId }, { $set: { workingSchedule: null } })
    }
  })
  await check('masked brief contacts preserve hidden snapshots and reject another tenant', async () => {
    const current = await briefService.getPartyBriefTemplate(tenantId, type._id)
    await briefService.publishPartyBriefTemplate({ context, body: { orderTypeId: String(type._id), expectedRevision: current.revision, title: current.title, fields: [...current.fields, { id: 'contact', label: 'Дополнительный контакт', type: 'contact', required: false }] } })
    const contact = { clientId: String(client._id), name: 'Сохранённое имя', phone: '79990000111' }
    const previous = { ...emptyPayload, _id: new Types.ObjectId(), tenantId, bookingVersion: 1, orderTypeId: type._id, eventBrief: { customAnswers: { question: 'Ответ', contact } } }
    const eventBrief = { customAnswers: { question: 'Новый ответ', contact: { clientId: contact.clientId } } }
    const prepared = await prepare({ context, previous, body: { bookingVersion: 1, eventBrief }, payload: { ...previous, eventBrief } })
    assert.equal(prepared.eventBrief.customAnswers.contact.phone, contact.phone)
    const foreign = await Clients.create({ tenantId: foreignTenantId, firstName: 'Другой клиент' })
    await assert.rejects(prepare({ context, previous, body: { bookingVersion: 1, eventBrief: { customAnswers: { contact: { clientId: String(foreign._id) } } } }, payload: { ...previous, eventBrief: { customAnswers: { contact: { clientId: String(foreign._id) } } } } }), { status: 400 })
  })
  if (process.argv.includes('--browser')) {
    const { runPartyBookingBrowserTest } =
      await import('./testPartyBookingBrowser.mjs')
    await runPartyBookingBrowserTest({
      connection,
      uri,
      company,
      type,
      location,
      client,
      service,
      root,
      directory,
    })
  }
  console.log(
    `RESULT ${passed} checks passed against isolated MongoDB replica set; logs: ${directory}`
  )
} finally {
  await connection?.close().catch(() => {})
  if (child.exitCode === null && !startError) {
    child.kill()
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error(`Could not stop owned mongod PID ${child.pid}`)),
        5000
      )
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  console.log(`Owned mongod stopped; retained diagnostic data: ${directory}`)
}
