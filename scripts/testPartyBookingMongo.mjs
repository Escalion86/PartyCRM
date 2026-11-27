// Uses only an owned temporary replica set. Never loads .env or an application URI.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { compileFunction } from 'node:vm'
import mongoose, { Schema, Types } from 'mongoose'
import * as booking from '../helpers/partyOrderBooking.js'
import * as serviceConfiguration from '../helpers/partyServiceConfiguration.js'
import * as multiPlace from '../helpers/partyMultiPlaceBooking.js'
import { formatAddressPoolShort } from '../helpers/addressPool.js'
import * as schedules from '../helpers/partyWorkingSchedule.js'
import { normalizePartyInboxTimeZone } from '../helpers/partyInboxSla.js'
import * as permissions from '../helpers/partyRolePermissions.js'
import * as brief from '../helpers/partyBriefTemplates.js'
import * as expectationHelpers from '../helpers/partyPaymentExpectations.js'
import * as venueHelpers from '../helpers/partyVenueBooking.js'
import * as venueSchemas from '../schemas/partyVenueBookingsSchema.js'
import * as sorting from '../helpers/partyOrderSorting.js'
import * as listHelpers from '../helpers/partyOrderListQuery.js'
import { canPartySetOffsiteOrder, PARTY_OFFSITE_DISABLED_MESSAGE } from '../helpers/partyCompanyModules.js'
import { sharePartyLocationBooking } from '../helpers/partySharedLocationBooking.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { buildPartyProposalApplication } from '../helpers/partyProposalApply.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { canAccessPartyTransaction } from '../server/partyTransactionAccess.js'
import { findPartyOrderConflicts, withPartyOrderStaffSchedule } from '../server/partyOrderConflicts.js'
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
    'partyStaffSchema',
    'partyTransactionsSchema',
    'partyOrderTypesSchema',
    'partyPaymentExpectationsSchema',
    'partyProposalsSchema',
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
    '{getPartyCompanyModel,getPartyClientModel,getPartyLocationModel,getPartyOrderModel,getPartyServiceModel,getPartyStaffModel,getPartyTransactionModel,getPartyOrderTypeModel,getPartyPaymentExpectationModel,getPartyProposalModel}'
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
    Staff,
    Transactions,
    OrderTypes,
    Expectations,
  ] = [
    'Company',
    'Client',
    'Location',
    'Order',
    'Service',
    'Staff',
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
    '{ensurePartyOrderTypes,normalizePartyOrderTypeTitle,validatePartyServiceBookingSettings}'
  )
  const prepare = await compile(
    'server/partyOrderBooking.js',
    {
      ...modelGetters,
      ...booking,
      ...schedules,
      ...serviceConfiguration,
      ...permissions,
      ...multiPlace,
      formatAddressPoolShort,
      parsePartyIsoDate,
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
      canPartySetOffsiteOrder,
      PARTY_OFFSITE_DISABLED_MESSAGE,
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
    'multi-place service lines preserve local pricing and only reserve the full set of rooms atomically',
    async () => {
      const day = '2026-12-05'
      const time = (value) => at(value, day)
      const room = await Locations.create({
        tenantId, title: 'Второй зал для интеграционного теста', capacity: 40, hourlyRentalRate: 1500,
        address: { town: 'Город', street: 'Вторая', house: '10', comment: 'Скрытая ремарка' },
        rentalConfiguration: multiPlace.normalizePartyLocationRentalConfiguration({
          extras: { fields: [{ id: 'tech', type: 'select', title: 'Техника', options: [{ id: 'speaker', title: 'Колонка', priceDelta: 300 }] }] },
        }),
      })
      const activity = await Services.create({
        tenantId, title: 'Программа в двух залах', price: 2500, duration: 30, includedRentalMinutes: 30,
        configuration: serviceConfiguration.normalizePartyServiceConfiguration({
          fields: [{ id: 'format', type: 'select', title: 'Формат', options: [{ id: 'long', title: 'Длинная программа', priceDelta: 500, durationDelta: 60 }] }],
        }),
      })
      const body = {
        bookingVersion: 2,
        orderTypeId: String(type._id),
        discount: { type: 'amount', value: 500 },
        places: [
          { id: 'first', locationId: String(location._id), eventDate: time('14:00'),
            rental: { startsAt: time('14:00'), endsAt: time('16:00') },
            serviceSelections: [{ lineId: 'activity-a', serviceId: String(activity._id), quantity: 1, parameters: { values: { format: 'long' } } }] },
          { id: 'second', locationId: String(room._id), guestCount: 30, eventDate: time('14:30'),
            rental: { startsAt: time('14:30'), endsAt: time('15:30') },
            parameters: { extras: { values: { tech: 'speaker' } } },
            serviceSelections: [{ lineId: 'activity-b', serviceId: String(activity._id), quantity: 1, parameters: { values: {} } }] },
        ],
      }
      const input = { ...emptyPayload, status: 'active', clientId: client._id }
      const payload = await prepare({ context, body, payload: input })
      assert.equal(payload.contractAmount, 8800)
      assert.equal(payload.durationMinutes, 90)
      assert.equal(payload.dateEnd.toISOString(), time('15:30'))
      assert.deepEqual(payload.servicesIds, [String(activity._id)])
      assert.deepEqual(payload.places.map((place) => place.pricingSnapshot.rentalKopecks), [200000, 150000])
      assert.deepEqual(payload.orderItems.map((item) => item.eventDate.toISOString()), [time('14:00'), time('14:30')])
      const write = (nextOrder) => venueWrite({
        tenantId, nextOrder,
        work: async ({ session }) => (await Orders.create([{ ...nextOrder, tenantId }], { session }))[0],
      })
      const release = (order) => venueWrite({
        tenantId, previousOrder: order, nextOrder: null,
        work: ({ session }) => Orders.findOneAndDelete({ _id: order._id, tenantId }, { session }).lean(),
      })
      let blocker, saved
      try {
        blocker = await write({
          ...emptyPayload, locationId: room._id,
          status: 'active', eventDate: new Date(time('14:45')), dateEnd: new Date(time('15:15')),
        })
        await assert.rejects(write(payload), { status: 409 })
        assert.equal(await Orders.countDocuments({ tenantId, bookingVersion: 2 }), 0)
        assert.equal(await Bookings.countDocuments({ tenantId, sourceType: 'order_place' }), 0)
        await release(blocker)
        blocker = null
        saved = await write(payload)
        assert.equal(await Bookings.countDocuments({ tenantId, orderId: saved._id, sourceType: 'order_place' }), 2)
        const previous = await Orders.findById(saved._id).lean()
        assert.equal(previous.places[1].guestCount, 30)
        assert.equal(previous.places[1].timeZone, 'Asia/Krasnoyarsk')
        assert.equal(previous.places[1].locationAddress.includes('Скрытая'), false)
        assert.equal(previous.places[1].locationConfiguration.details[0], 'Техника: Колонка')
        assert.equal(previous.orderItems[0].serviceConfiguration.details[0], 'Формат: Длинная программа')
        await Locations.updateOne({ _id: room._id }, { $set: { rentalConfiguration: null, hourlyRentalRate: 1 } })
        const unchanged = await prepare({ context, body, payload: input, previous })
        assert.equal(unchanged.contractAmount, 8800)
        await assert.rejects(prepare({ context, body: { locationId: String(room._id) }, payload: input, previous }), { code: 'partycrm_multi_place_editor_required' })
        const ordinaryEdit = await prepare({ context, body: { adminComment: 'Заметка' }, payload: { ...input, adminComment: 'Заметка' }, previous })
        assert.deepEqual(ordinaryEdit.places, previous.places)
        assert.deepEqual(ordinaryEdit.orderItems, previous.orderItems)
        await release(saved)
        assert.equal(await Bookings.countDocuments({ tenantId, orderId: saved._id, sourceType: 'order_place' }), 0)
        saved = null
      } finally {
        if (blocker) await release(blocker)
        if (saved) await release(saved)
        await Locations.deleteOne({ _id: room._id, tenantId })
        await Services.deleteOne({ _id: activity._id, tenantId })
      }
    }
  )
  await check(
    'simultaneous multi-place orders cannot assign the same performer across different rooms',
    async () => {
      const performer = await Staff.create({ tenantId, firstName: 'Исполнитель' })
      const room = await Locations.create({ tenantId, title: 'Зал для одновременной программы' })
      const start = at('14:00', '2026-12-06')
      const end = at('15:00', '2026-12-06')
      const reserveFor = async (locationId) => {
        const prepared = await prepare({
          context,
          body: {
            bookingVersion: 2,
            orderTypeId: String(type._id),
            places: [{
              id: 'stage',
              locationId: String(locationId),
              eventDate: start,
              rental: { startsAt: start, endsAt: end },
              serviceSelections: [],
            }],
          },
          payload: {
            ...emptyPayload,
            status: 'active',
            clientId: client._id,
            assignedStaff: [{ staffId: performer._id, placeId: 'stage' }],
          },
        })
        return venueWrite({
          tenantId,
          nextOrder: prepared,
          work: ({ session }) => withPartyOrderStaffSchedule({
            tenantId,
            payload: prepared,
            session,
            getStaffModel: modelGetters.getPartyStaffModel,
            work: async (session) => {
              const conflicts = await findPartyOrderConflicts({
                PartyOrders: Orders, tenantId, payload: prepared, session, checkLocation: false,
              })
              if (conflicts.staffConflicts.length)
                throw Object.assign(new Error('Исполнитель занят'), { status: 409 })
              return (await Orders.create([{ ...prepared, tenantId }], { session }))[0]
            },
          }),
        })
      }
      try {
        const results = await Promise.allSettled([reserveFor(location._id), reserveFor(room._id)])
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
        assert.equal(results.find((result) => result.status === 'rejected')?.reason.status, 409)
        const orders = await Orders.find({ tenantId, 'assignedStaff.staffId': performer._id }).lean()
        assert.equal(orders.length, 1)
        assert.equal(await Bookings.countDocuments({ tenantId, orderId: orders[0]._id, sourceType: 'order_place' }), 1)
      } finally {
        const orders = await Orders.find({ tenantId, 'assignedStaff.staffId': performer._id }).lean()
        for (const order of orders) {
          await venueWrite({
            tenantId, previousOrder: order, nextOrder: null,
            work: ({ session }) => Orders.findOneAndDelete({ tenantId, _id: order._id }, { session }).lean(),
          })
        }
        await Staff.deleteOne({ tenantId, _id: performer._id })
        await Locations.deleteOne({ tenantId, _id: room._id })
      }
    }
  )
  await check(
    'configured services calculate and persist exact terms, protect scheduling and retain catalog snapshots',
    async () => {
      const flexible = await Services.create({
        tenantId,
        title: 'Игра',
        price: 1000,
        duration: 30,
        configuration: serviceConfiguration.normalizePartyServiceConfiguration({
          participantTiers: [
            { min: 1, max: 10, price: 1000, durationMinutes: 30 },
            { min: 11, max: 20, price: 1400, durationMinutes: 45 },
          ],
          addons: [{ id: 'props', title: 'Реквизит', priceDelta: 200, durationDelta: 5 }],
          optionGroups: [{
            id: 'format', title: 'Формат', required: true,
            options: [
              { id: 'regular', title: 'Стандарт', priceDelta: 0, durationDelta: 0 },
              { id: 'extended', title: 'Расширенный', priceDelta: 300, durationDelta: 10 },
            ],
          }],
        }),
      })
      const eventDate = at('12:00')
      const payload = { ...emptyPayload, placeType: 'client_address', locationId: null, eventDate }
      const select = (parameters) => [{
        serviceId: String(flexible._id), quantity: 1, parameters,
      }]
      const extended = { participants: 12, addonIds: ['props'], optionIds: { format: 'extended' } }
      const regular = { participants: 10, addonIds: [], optionIds: { format: 'regular' } }
      const body = { bookingVersion: 1, serviceSelections: select(extended) }
      const prepared = await prepare({ context, body, payload })
      assert.equal(prepared.contractAmount, 1900)
      assert.equal(prepared.clientPayment.totalAmount, 1900)
      assert.equal(prepared.durationMinutes, 60)
      assert.equal(prepared.dateEnd.toISOString(), at('13:00'))
      const saved = await Orders.create({ tenantId, ...prepared })
      const previous = await Orders.findById(saved._id).lean()
      assert.deepEqual(previous.orderItems[0].serviceConfiguration.parameters, extended)

      await assert.rejects(prepare({
        context,
        body: { ...body, serviceSelections: select({ ...extended, participants: 21 }) },
        payload,
      }), { status: 400 })
      await Services.updateOne({ tenantId, _id: flexible._id }, { $set: { configuration: null, price: 9000, duration: 150 } })
      const unchanged = await prepare({
        context, previous, body: { adminComment: 'Уточнить реквизит' },
        payload: { ...previous, orderItems: [], contractAmount: 1 },
      })
      assert.deepEqual(unchanged.orderItems, previous.orderItems)
      assert.equal(unchanged.contractAmount, 1900)

      const selectionBody = { serviceSelections: select(regular) }
      const restricted = {
        ...context,
        role: 'admin',
        staff: { ...context.staff, role: 'admin' },
        position: { permissions: { 'orders.servicesIds': 'edit', 'orders.dateEnd': 'read' } },
      }
      await assert.rejects(
        prepare({ context: restricted, previous, body: selectionBody, payload: previous }),
        { status: 403 }
      )
      const configuredOperator = {
        ...restricted,
        position: { permissions: { 'orders.servicesIds': 'edit', 'orders.dateEnd': 'edit' } },
      }
      const updated = await prepare({ context: configuredOperator, previous, body: selectionBody, payload: previous })
      assert.equal(updated.contractAmount, 1000)
      assert.equal(updated.durationMinutes, 30)
      assert.equal(updated.dateEnd.toISOString(), at('12:30'))
      assert.equal(updated.orderItems[0].serviceConfiguration.basePrice, 1000)
      assert.deepEqual(updated.orderItems[0].serviceConfiguration.parameters, regular)
    }
  )
  await check(
    'custom service parameters round-trip through the catalog APIs and their order snapshot survives catalog edits',
    async () => {
      const routeDeps = {
        ...modelGetters,
        ...serviceConfiguration,
        ...typeHelpers,
        getPartyRequestContext: async ({ req, managementOnly }) => {
          assert.equal(managementOnly, true)
          return { context: { ...context, tenantId: String(req.tenantId || tenantId) } }
        },
        parseJsonBody: async (req) => req.body,
        isValidObjectId: mongoose.isObjectIdOrHexString,
        NextResponse: { json: (body, { status }) => ({ body, status }) },
        partyError: (status, code, message) => ({ status, body: { error: { code, message } } }),
      }
      const { GET, POST } = await compile('app/api/party/services/route.js', routeDeps, '{GET,POST}')
      const PUT = await compile('app/api/party/services/[id]/route.js', routeDeps, 'PUT')
      const configuration = { fields: [
        { id: 'distance', title: 'Расстояние выезда', type: 'number', unit: 'км', required: true, allowDecimal: true, min: 1, max: 100, pricePerUnit: 40, durationPerUnit: 4 },
        { id: 'rooms', title: 'Число комнат', type: 'ranges', unit: 'комн.', required: true, mode: 'base', tiers: [
          { min: 1, max: 10, price: 1300, durationMinutes: 35 },
          { min: 11, max: 20, price: 1500, durationMinutes: 45, includedUnits: 10, pricePerUnit: 50, maxPrice: 1700 },
        ] },
        { id: 'setup', title: 'Подготовка', type: 'ranges', unit: 'час', mode: 'adjustment', tiers: [
          { min: 0, max: 10, price: -100, durationMinutes: -5 },
        ] },
        { id: 'format', title: 'Формат', type: 'select', required: true, options: [
          { id: 'long', title: 'Длинный', priceDelta: 300, durationDelta: 15 },
        ] },
        { id: 'extras', title: 'Дополнительные материалы', type: 'checkboxes', options: [
          { id: 'photo', title: 'Фото', priceDelta: 100, durationDelta: 5 },
          { id: 'gift', title: 'Подарок', priceDelta: 250, durationDelta: 10 },
        ] },
      ] }
      const created = await POST({ body: { title: 'Игра с произвольным расчётом', price: 900, duration: 30, configuration } })
      assert.equal(created.status, 201)
      const id = String(created.body.data._id)
      const serviceParams = { params: Promise.resolve({ id }) }
      const persisted = serviceConfiguration.normalizePartyServiceConfiguration(configuration)
      assert.deepEqual((await Services.findById(id).lean()).configuration, persisted)
      const listed = await GET({ nextUrl: new URL('https://party.test/api/party/services') })
      assert.deepEqual(listed.body.data.find((item) => String(item._id) === id).configuration, persisted)
      assert.equal((await PUT({ tenantId: foreignTenantId, body: { configuration: null } }, serviceParams)).status, 404)
      assert.equal((await PUT({ body: { title: 'Игра по заявке' } }, serviceParams)).status, 200)
      assert.deepEqual((await Services.findById(id).lean()).configuration, persisted)
      const invalidConfig = await PUT({ body: { configuration: { fields: [{ id: 'bad', title: 'Число', type: 'number' }] } } }, serviceParams)
      assert.equal(invalidConfig.status, 400)
      assert.deepEqual((await Services.findById(id).lean()).configuration, persisted)

      const parameters = { values: { distance: 2.5, rooms: 12, setup: 5, format: 'long', extras: ['photo', 'gift'] } }
      const payload = { ...emptyPayload, placeType: 'client_address', locationId: null, eventDate: at('12:00') }
      const body = { bookingVersion: 1, serviceSelections: [{ serviceId: id, quantity: 1, parameters }] }
      const prepared = await prepare({ context, body, payload })
      assert.equal(prepared.contractAmount, 2250)
      assert.equal(prepared.durationMinutes, 80)
      assert.equal(prepared.dateEnd.toISOString(), at('13:20'))
      const saved = await Orders.create({ tenantId, ...prepared })
      const previous = await Orders.findById(saved._id).lean()
      const snapshot = previous.orderItems[0].serviceConfiguration
      assert.deepEqual(snapshot.parameters, parameters)
      assert.deepEqual(snapshot.definition, persisted)
      assert.equal(snapshot.details.length, 5)
      const operator = {
        ...context,
        role: 'admin',
        staff: { ...context.staff, role: 'admin' },
        position: { permissions: { orders: 'read', 'orders.servicesIds': 'read' } },
      }
      const restrictedView = permissions.filterPartyOrderForAccess(operator, previous)
      assert.equal(restrictedView.orderItems, undefined)
      const visibleSnapshot = restrictedView.serviceSelections[0].serviceConfiguration
      assert.equal(visibleSnapshot.basePrice, undefined)
      assert.deepEqual(visibleSnapshot.parameters, parameters)
      assert.deepEqual(visibleSnapshot.definition, serviceConfiguration.redactPartyServiceConfigurationPrices(persisted))

      assert.equal((await PUT({ body: { configuration: null, price: 9999, duration: 120 } }, serviceParams)).status, 200)
      const edited = await prepare({ context, previous, payload: previous, body: {
        serviceSelections: [{ serviceId: id, quantity: 1, parameters: { values: { ...parameters.values, distance: 1.25 } } }],
      } })
      assert.equal(edited.contractAmount, 2200)
      assert.equal(edited.durationMinutes, 75)
      assert.deepEqual(edited.orderItems[0].serviceConfiguration.definition, snapshot.definition)

      const optionalConfiguration = serviceConfiguration.normalizePartyServiceConfiguration({
        fields: [{ id: 'gift', title: 'Подарок', type: 'checkboxes', options: [{ id: 'box', title: 'Коробка', priceDelta: 150 }] }],
      })
      assert.equal((await PUT({ body: { configuration: optionalConfiguration } }, serviceParams)).status, 200)
      const optionalBody = { bookingVersion: 1, serviceSelections: [{ serviceId: id, quantity: 1, parameters: { values: {} } }] }
      const optionalOrder = await Orders.create({ tenantId, ...await prepare({ context, body: optionalBody, payload }) })
      const optionalSaved = await Orders.findById(optionalOrder._id).lean()
      assert.deepEqual(optionalSaved.orderItems[0].serviceConfiguration.parameters, { values: {} })
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
  await check('published proposal variants keep tenant scope and persist exactly one client choice', async () => {
    const publication = await compile('server/partyProposalPublications.js', {
      ...modelGetters,
      process: { env: { AUTH_SECRET: randomBytes(32).toString('hex') } },
      createHmac, randomBytes, timingSafeEqual, normalizePartyInboxTimeZone,
      partyDateAtTime: schedules.partyDateAtTime,
      isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(id),
    }, '{changePartyProposalPublication,getPublicPartyProposal,answerPublicPartyProposal,listPartyProposalsWithPublication}')
    const Proposals = models.getPartyProposalModel
    await Proposals.init()
    const order = await newOrder()
    const foreignOrder = await newOrder({ tenantId: foreignTenantId })
    const proposal = (tenant, target, version) => ({
      tenantId: tenant, orderId: target._id, number: 'КП-публикация', version,
      senderSnapshot: { displayName: 'Компания', inn: 'Скрытый реквизит' },
      recipientSnapshot: { displayName: 'Клиент', phone: 'Скрытый телефон' },
      eventSnapshot: { title: 'Праздник', address: 'Скрытый адрес' },
      items: [{ title: 'Программа', quantity: version, unitPrice: 1000, total: version * 1000 }],
      total: version * 1000,
    })
    const [first, second, foreign] = await Proposals.create([
      proposal(tenantId, order, 1), proposal(tenantId, order, 2), proposal(foreignTenantId, foreignOrder, 1),
    ])
    const input = { tenantId, proposalId: String(first._id), publish: true, requestedIds: [String(first._id), String(second._id)] }
    await assert.rejects(publication.changePartyProposalPublication({ ...input, tenantId: foreignTenantId }), { status: 404 })
    await assert.rejects(publication.changePartyProposalPublication({ ...input, requestedIds: [String(first._id), String(foreign._id)] }), { status: 404 })

    const listed = await publication.changePartyProposalPublication(input)
    const token = listed[0].publicPath.split('/').at(-1)
    assert.equal(listed[0].publicPath, listed[1].publicPath)
    assert.ok(listed.every((item) => item.status === 'sent' && !item.sharedPublicationId))
    assert.equal((await Orders.findById(order._id).lean()).proposalPublication, undefined)
    const alteredToken = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`
    assert.equal(await publication.getPublicPartyProposal(alteredToken), null)
    const tokenForAnotherTenant = [String(foreignTenantId), ...token.split('.').slice(1)].join('.')
    assert.equal(await publication.getPublicPartyProposal(tokenForAnotherTenant), null)
    const initial = await publication.getPublicPartyProposal(token)
    assert.equal(initial.variants.length, 2)
    assert.equal(initial.variants[1].total, 2000)
    assert.doesNotMatch(JSON.stringify(initial), /Скрытый|tenantId|orderId|serviceId/)

    const choice = await Promise.allSettled([0, 1].map((variant) =>
      publication.answerPublicPartyProposal(token, { action: 'accept', variant, revision: initial.revision })
    ))
    assert.equal(choice.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(choice.find(({ status }) => status === 'rejected').reason.status, 409)
    const selected = choice.find(({ status }) => status === 'fulfilled').value
    const revisions = await publication.listPartyProposalsWithPublication({ tenantId, orderId: order._id })
    assert.equal(revisions.filter(({ status }) => status === 'accepted').length, 1)
    assert.equal((await Orders.findById(order._id).lean()).contractAmount, 1000)

    const reset = await publication.answerPublicPartyProposal(token, { action: 'reset', revision: selected.revision })
    assert.equal(reset.decision, '')
    const declined = await publication.answerPublicPartyProposal(token, { action: 'reject', revision: reset.revision })
    assert.equal(declined.decision, 'rejected')
    const accepted = await publication.answerPublicPartyProposal(token, { action: 'accept', variant: 1, revision: declined.revision })
    const apply = await compile('app/api/party/proposals/[id]/apply-to-order/route.js', {
      ...modelGetters, buildPartyProposalApplication, getPartyOrderWriteGuard,
      getPartyRequestContext: async () => ({ context }),
      getPartyCompanyTariffAccessState: async () => ({ access: { allowDocuments: true } }),
      isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(id),
      parseJsonBody: async () => ({ expectedCommercialRevision: 0 }),
      partyError: (status, code, message) => ({ status, code, message }),
      NextResponse: { json: (body) => ({ status: 200, body }) },
      syncPartyOrderInventory: async () => null,
      syncPartyOrderCalendarAfterCrud: async () => {},
      recordPartyOrderAudit: async () => {},
    }, 'POST')
    assert.equal((await apply({}, { params: { id: String(second._id) } })).status, 200)
    assert.equal((await Orders.findById(order._id).lean()).contractAmount, 2000)
    assert.equal((await publication.getPublicPartyProposal(token)).canRespond, false)
    await assert.rejects(publication.answerPublicPartyProposal(token, { action: 'reset', revision: accepted.revision }), { status: 409 })

    await Orders.updateOne({ _id: order._id, tenantId }, { $unset: { 'proposalPublication.lockedAt': '', agreedProposal: '' } })
    await Orders.updateOne({ _id: order._id, tenantId }, { $set: { 'proposalPublication.validUntil': new Date(0) } })
    assert.equal((await publication.getPublicPartyProposal(token)).canRespond, false)
    await assert.rejects(publication.answerPublicPartyProposal(token, { action: 'reset', revision: accepted.revision }), { status: 409 })
    const revoked = await publication.changePartyProposalPublication({ ...input, publish: false })
    assert.equal(await publication.getPublicPartyProposal(token), null)
    assert.equal(revoked.filter(({ status }) => status === 'accepted').length, 1)
    assert.ok(revoked.every(({ publicPath }) => !publicPath))
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
