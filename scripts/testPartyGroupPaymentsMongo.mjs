// Isolated real-Mongo checks. Never reads .env or accepts an application URI.
// Usage: node scripts/testPartyGroupPaymentsMongo.mjs
// Optional: MONGOD_BINARY=/absolute/path/to/mongod
// Uses production schemas/services via compileFunction solely to resolve Next aliases.
// Tests Mongo service transactions and the same closure CAS guard, not HTTP routes.
// Keeps its unique temporary database/log directory; stops only its own mongod.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { compileFunction } from 'node:vm'
import mongoose, { Schema, Types } from 'mongoose'

const root = new URL('../', import.meta.url)
const compile = async (file, deps, result) => {
  const source = (await readFile(new URL(file, root), 'utf8'))
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
    .replaceAll('export async function ', 'async function ')
    .replace(/^export\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\r?\n/gm, '')
    .replace(/^export default (\w+);?$/gm, '')
  return compileFunction(`${source}\nreturn ${result}`, Object.keys(deps), { filename: file })(...Object.values(deps))
}
const port = await new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject).listen(0, '127.0.0.1', () => {
    const value = server.address().port
    server.close(() => resolve(value))
  })
})
const directory = await mkdtemp(path.join(os.tmpdir(), 'partycrm-finance-mongo-'))
const binary = process.env.MONGOD_BINARY || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe' : 'mongod')
const child = spawn(binary, ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'partycrm_test', '--logpath', path.join(directory, 'mongod.log')], { windowsHide: true, stdio: 'ignore' })
let startError
child.once('error', (error) => { startError = error })
const uri = `mongodb://127.0.0.1:${port}/partycrm_finance_test?directConnection=true`
let connection, bootstrap
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let passed = 0
const check = async (name, callback) => { await callback(); passed++; console.log(`PASS ${name}`) }
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startError) throw startError
    if (child.exitCode !== null) throw new Error(`mongod exited ${child.exitCode}; log: ${directory}`)
    try { bootstrap = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 300 }).asPromise(); break } catch { await delay(200) }
  }
  if (!bootstrap) throw new Error('Isolated mongod did not become ready')
  await bootstrap.db.admin().command({ replSetInitiate: { _id: 'partycrm_test', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } })
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await bootstrap.db.admin().command({ hello: 1 })).isWritablePrimary) break
    if (attempt === 99) throw new Error('Replica set did not elect primary')
    await delay(200)
  }
  connection = bootstrap
  const getProductModel = ({ name, collectionName, schemaDefinition, schemaOptions, configureSchema }) => {
    if (connection.models[name]) return connection.models[name]
    const schema = new Schema(schemaDefinition, schemaOptions)
    configureSchema?.(schema)
    return connection.model(name, schema, collectionName)
  }
  const modelDeps = { Schema, PRODUCTS: { PARTYCRM: 'partycrm' }, getProductModel }
  const orderSchema = await compile('schemas/partyOrdersSchema.js', { Schema }, 'partyOrdersSchema')
  const transactionSchema = await compile('schemas/partyTransactionsSchema.js', { Schema }, 'partyTransactionsSchema')
  const Orders = getProductModel({ name: 'Order', collectionName: 'orders', schemaDefinition: orderSchema, schemaOptions: { timestamps: true } })
  const Transactions = getProductModel({ name: 'Transaction', collectionName: 'transactions', schemaDefinition: transactionSchema, schemaOptions: { timestamps: true } })
  const Groups = (await compile('server/partyEventGroupModels.js', modelDeps, 'getPartyEventGroupModel'))()
  const Corrections = (await compile('server/partyGroupPaymentModels.js', modelDeps, 'getPartyGroupPaymentCorrectionModel'))()
  const Payments = (await compile('server/partyGroupPaymentModels.js', modelDeps, 'getPartyGroupPaymentModel'))()
  const getLock = await compile('server/partyFinancialModels.js', { ...modelDeps, settlements: {}, operations: {}, statements: {}, moneyTasks: {} }, 'getPartyFinancialLockModel')
  const financialHelpers = await compile('helpers/partyFinancialSettlements.js', {}, '{isFinancialId, financialError}')
  const transaction = await compile('server/partyFinancialSettlements.js', { getPartyFinancialLockModel: getLock, ...financialHelpers }, 'withPartyFinancialTransaction')
  const guard = await compile('helpers/partyOrderWriteGuard.js', {}, 'getPartyOrderWriteGuard')
  await Promise.all([Orders.init(), Transactions.init(), Groups.init(), Payments.init(), Corrections.init(), getLock().init()])
  const deps = { createHash, Types, getPartyOrderModel: async () => Orders, getPartyTransactionModel: async () => Transactions, getPartyEventGroupModel: async () => Groups, getPartyGroupPaymentModel: async () => Payments, withPartyFinancialTransaction: transaction }
  const load = (overrides = {}) => compile('server/partyGroupPayments.js', { ...deps, ...overrides }, '{createPartyGroupPayment,listPartyGroupPayments,partyGroupPaymentCents,partyGroupPaymentReceipt}')
  const api = await load()
  const loadCorrection = (overrides = {}) => compile('server/partyGroupPaymentCorrections.js', { ...deps, partyGroupPaymentCents: api.partyGroupPaymentCents, partyGroupPaymentReceipt: api.partyGroupPaymentReceipt, getPartyGroupPaymentCorrectionModel: async () => Corrections, ...overrides }, '{correctPartyGroupPayment}')
  const correctionApi = await loadCorrection()
  const tenantId = String(new Types.ObjectId()), foreignTenantId = String(new Types.ObjectId())
  const groupId = new Types.ObjectId(), orderIds = [String(new Types.ObjectId()), String(new Types.ObjectId())]
  const reset = async () => {
    await Promise.all([Orders.deleteMany({}), Transactions.deleteMany({}), Groups.deleteMany({}), Payments.deleteMany({}), Corrections.deleteMany({})])
    await Groups.create({ _id: groupId, tenantId, revision: 1 })
    await Orders.create(orderIds.map((_id, i) => ({ _id, tenantId, title: `Part ${i}`, status: 'active', partyEventGroupId: groupId })))
  }
  const body = () => ({ idempotencyKey: randomUUID(), expectedRevision: 1, amount: 20.33, allocations: [{ orderId: orderIds[0], amount: 10.11 }, { orderId: orderIds[1], amount: 10.22 }], date: '2026-09-17', paymentMethod: 'transfer', category: 'deposit' })
  const save = (payload, service = api, tenant = tenantId) => service.createPartyGroupPayment({ tenantId: tenant, orderId: orderIds[0], body: payload })
  await check('concurrent duplicate requests: one receipt and exactly two income entries', async () => {
    await reset(); const payload = body()
    const settled = await Promise.allSettled(Array.from({ length: 6 }, () => save(payload)))
    for (const result of settled) if (result.status === 'rejected') throw result.reason
    const results = settled.map((result) => result.value)
    assert.equal(results.filter((row) => !row.replayed).length, 1)
    assert.equal(await Payments.countDocuments(), 1)
    assert.equal(await Transactions.countDocuments(), 2)
    assert.equal((await Transactions.find().lean()).reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 2033)
    await assert.rejects(save({ ...payload, comment: 'changed' }), { status: 409 })
  })
  await check('forced failure after actual insertion rolls back all writes', async () => {
    await reset()
    const wrapped = Object.create(Orders)
    wrapped.updateOne = async () => { throw new Error('injected post-insertion failure') }
    await assert.rejects(save(body(), await load({ getPartyOrderModel: async () => wrapped })), /injected/)
    assert.equal(await Transactions.countDocuments(), 0); assert.equal(await Payments.countDocuments(), 0)
    assert.ok((await Orders.find().lean()).every((row) => row.sharedLocationRevision === 0))
  })
  await check('closure wins while payment transaction is paused: retry rejects closed order', async () => {
    await reset()
    let arrived, release
    const paused = new Promise((resolve) => { arrived = resolve }), resume = new Promise((resolve) => { release = resolve })
    let first = true
    const wrapped = Object.create(Transactions)
    wrapped.create = async (...args) => { const rows = await Transactions.create(...args); if (first) { first = false; arrived(); await resume } return rows }
    const pending = save(body(), await load({ getPartyTransactionModel: async () => wrapped }))
    await paused
    const original = await Orders.findById(orderIds[0]).lean()
    const closed = await Orders.updateOne({ _id: original._id, tenantId, ...guard(original) }, { $set: { status: 'closed' }, $inc: { commercialRevision: 1 } })
    assert.equal(closed.modifiedCount, 1); release()
    await assert.rejects(pending, { status: 409 })
    assert.equal(await Payments.countDocuments(), 0); assert.equal(await Transactions.countDocuments(), 0)
  })
  await check('payment wins: closure using previous readiness snapshot is rejected', async () => {
    await reset(); const original = await Orders.findById(orderIds[0]).lean()
    await save(body())
    const closed = await Orders.updateOne({ _id: original._id, tenantId, ...guard(original) }, { $set: { status: 'closed' }, $inc: { commercialRevision: 1 } })
    assert.equal(closed.matchedCount, 0)
  })
  await check('foreign company cannot read or write payment history', async () => {
    await reset(); await save(body())
    await assert.rejects(save(body(), api, foreignTenantId), { status: 404 })
    await assert.rejects(api.listPartyGroupPayments({ tenantId: foreignTenantId, orderId: orderIds[0] }), { status: 404 })
    assert.equal(await Payments.countDocuments(), 1)
  })
  await check('mismatched cents fail before ledger writes', async () => {
    await reset(); await assert.rejects(save({ ...body(), amount: 20.34 }), { status: 400 })
    assert.equal(await Transactions.countDocuments(), 0)
  })
  const correctionBody = () => ({ idempotencyKey: randomUUID(), expectedPaymentRevision: 1, reason: 'Исправлено распределение', allocations: [{ orderId: orderIds[0], amount: 9 }, { orderId: orderIds[1], amount: 11.33 }] })
  const correct = (paymentId, payload, service = correctionApi) => service.correctPartyGroupPayment({ tenantId, orderId: orderIds[0], paymentId, body: payload })
  await check('concurrent identical corrections change allocation once and preserve income total', async () => {
    await reset(); const created = await save(body()), payload = correctionBody()
    const settled = await Promise.allSettled(Array.from({ length: 4 }, () => correct(created.payment._id, payload)))
    for (const result of settled) if (result.status === 'rejected') throw result.reason
    assert.equal(settled.filter((result) => !result.value.replayed).length, 1)
    const payment = await Payments.findById(created.payment._id).lean()
    assert.equal(payment.revision, 2); assert.equal(payment.history.length, 1)
    assert.equal(await Corrections.countDocuments(), 1); assert.equal(await Transactions.countDocuments(), 2)
    assert.deepEqual((await Transactions.find().sort({ orderId: 1 }).lean()).map((row) => row.amount), [9, 11.33])
    await assert.rejects(correct(created.payment._id, correctionBody()), { status: 409 })
  })
  await check('late correction failure rolls back ledger, receipt, history and order revision', async () => {
    await reset(); const created = await save(body())
    const wrapped = Object.create(Corrections)
    wrapped.create = async () => { throw new Error('injected correction receipt failure') }
    await assert.rejects(correct(created.payment._id, correctionBody(), await loadCorrection({ getPartyGroupPaymentCorrectionModel: async () => wrapped })), /injected/)
    assert.deepEqual((await Transactions.find().sort({ orderId: 1 }).lean()).map((row) => row.amount), [10.11, 10.22])
    assert.equal((await Payments.findById(created.payment._id).lean()).revision, 1)
    assert.equal(await Corrections.countDocuments(), 0)
    assert.ok((await Orders.find().lean()).every((row) => row.sharedLocationRevision === 1))
  })
  await check('closure wins during correction: transaction retries then rejects without changing ledger', async () => {
    await reset(); const created = await save(body())
    let arrived, release, first = true
    const paused = new Promise((resolve) => { arrived = resolve }), resume = new Promise((resolve) => { release = resolve })
    const wrapped = Object.create(Transactions)
    wrapped.updateOne = async (...args) => { const row = await Transactions.updateOne(...args); if (first) { first = false; arrived(); await resume } return row }
    const pending = correct(created.payment._id, correctionBody(), await loadCorrection({ getPartyTransactionModel: async () => wrapped }))
    await paused
    const original = await Orders.findById(orderIds[0]).lean()
    assert.equal((await Orders.updateOne({ _id: original._id, tenantId, ...guard(original) }, { $set: { status: 'closed' }, $inc: { commercialRevision: 1 } })).modifiedCount, 1)
    release(); await assert.rejects(pending, { status: 409 })
    assert.equal(await Corrections.countDocuments(), 0)
    assert.deepEqual((await Transactions.find().sort({ orderId: 1 }).lean()).map((row) => row.amount), [10.11, 10.22])
  })
  await check('different concurrent corrections: one winner, one stale revision rejection', async () => {
    await reset(); const created = await save(body())
    const payload = correctionBody(), other = { ...correctionBody(), allocations: [{ orderId: orderIds[0], amount: 8 }, { orderId: orderIds[1], amount: 12.33 }] }
    const results = await Promise.allSettled([correct(created.payment._id, payload), correct(created.payment._id, other)])
    assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
    assert.equal(results.find((row) => row.status === 'rejected').reason.status, 409)
    assert.equal(await Corrections.countDocuments(), 1)
  })
  await check('foreign company cannot correct another company receipt', async () => {
    await reset(); const created = await save(body())
    await assert.rejects(correctionApi.correctPartyGroupPayment({ tenantId: foreignTenantId, orderId: orderIds[0], paymentId: created.payment._id, body: correctionBody() }), { status: 404 })
    assert.equal(await Corrections.countDocuments(), 0)
    assert.equal((await Payments.findById(created.payment._id).lean()).revision, 1)
  })
  await check('divergent ledger blocks correction and retains pre-existing data', async () => {
    await reset(); const created = await save(body())
    await Transactions.updateOne({ orderId: orderIds[0] }, { $set: { amount: 7 } })
    await assert.rejects(correct(created.payment._id, correctionBody()), { status: 409 })
    assert.equal(await Corrections.countDocuments(), 0)
    assert.equal((await Transactions.findOne({ orderId: orderIds[0] }).lean()).amount, 7)
  })
  // Legacy migration checks run against the same isolated real replica set.
  const Migrations = (await compile('server/partyLegacyLedgerModels.js', modelDeps, 'getPartyLegacyLedgerMigrationModel'))()
  await Migrations.init()
  const Staff = getProductModel({ name: 'Staff', collectionName: 'staff', schemaDefinition: await compile('schemas/partyStaffSchema.js', { Schema }, 'partyStaffSchema') })
  const Clients = getProductModel({ name: 'Client', collectionName: 'clients', schemaDefinition: await compile('schemas/partyClientsSchema.js', { Schema }, 'partyClientsSchema') })
  await Promise.all([Staff.init(), Clients.init()])
  const loadLegacy = (overrides = {}) => compile('server/partyLegacyLedger.js', { ...deps, getPartyStaffModel: async () => Staff, getPartyClientModel: async () => Clients, getPartyLegacyLedgerMigrationModel: async () => Migrations, ...overrides }, '{getPartyLegacyLedger,migratePartyLegacyLedger}')
  const legacyApi = await loadLegacy()
  const staffId = new Types.ObjectId()
  await Staff.create({ _id: staffId, tenantId, name: 'Migration performer' })
  const legacyRows = () => [
    { _id: new Types.ObjectId(), amount: 101.23, type: 'income', category: 'deposit', date: new Date('2025-02-03T04:05:06.789Z'), paymentMethod: 'cash', comment: 'Legacy income' },
    { _id: new Types.ObjectId(), amount: 0.45, type: 'expense', category: 'payout', staffId, date: new Date('2025-02-04T05:06:07.890Z'), paymentMethod: 'transfer', comment: 'Legacy payout' },
  ]
  const seedLegacy = async () => {
    await reset(); await Migrations.deleteMany({})
    await Orders.updateOne({ _id: orderIds[0] }, { $set: { transactions: legacyRows() } })
    return Orders.findById(orderIds[0]).lean()
  }
  const previewLegacy = () => legacyApi.getPartyLegacyLedger({ tenantId, orderId: orderIds[0] })
  const migrate = (expectedFingerprint, service = legacyApi) => service.migratePartyLegacyLedger({ tenantId, orderId: orderIds[0], expectedFingerprint })
  const ledgerValues = (rows) => rows.map((row) => ({ amount: row.amount, type: row.type, category: row.category, staffId: row.staffId ? String(row.staffId) : null, date: new Date(row.date).toISOString(), paymentMethod: row.paymentMethod, comment: row.comment })).sort((a, b) => a.amount - b.amount)
  await check('legacy migration preserves income, expense, cents, staff and dates, backs up and clears source', async () => {
    const original = await seedLegacy(), preview = await previewLegacy()
    const result = await migrate(preview.fingerprint)
    assert.equal(result.status, 'migrated'); assert.equal(result.replayed, false)
    assert.deepEqual(ledgerValues(await Transactions.find({ tenantId, orderId: orderIds[0] }).lean()), ledgerValues(original.transactions))
    const updated = await Orders.findById(orderIds[0]).lean()
    assert.equal(updated.transactions.length, 0); assert.ok(updated.legacyLedgerMigrationId); assert.ok(updated.legacyLedgerMigratedAt)
    const backup = await Migrations.findOne({ tenantId, orderId: orderIds[0] }).lean()
    assert.deepEqual(ledgerValues(backup.sourceEntries), ledgerValues(original.transactions))
  })
  await check('concurrent migration retries import legacy entries only once', async () => {
    await seedLegacy(); const preview = await previewLegacy()
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => migrate(preview.fingerprint)))
    for (const result of results) if (result.status === 'rejected') throw result.reason
    assert.equal(results.filter((row) => !row.value.replayed).length, 1)
    assert.equal(await Transactions.countDocuments(), 2); assert.equal(await Migrations.countDocuments(), 1)
  })
  await check('stale migration fingerprint rejects without changing embedded or persisted ledger', async () => {
    await seedLegacy(); const preview = await previewLegacy()
    await Orders.updateOne({ _id: orderIds[0] }, { $set: { 'transactions.0.amount': 102.23 } })
    await assert.rejects(migrate(preview.fingerprint), { status: 409 })
    assert.equal(await Transactions.countDocuments(), 0); assert.equal(await Migrations.countDocuments(), 0)
    assert.equal((await Orders.findById(orderIds[0]).lean()).transactions[0].amount, 102.23)
  })
  await check('mixed embedded and persisted ledger blocks migration', async () => {
    await seedLegacy(); const preview = await previewLegacy()
    await Transactions.create({ tenantId, orderId: orderIds[0], amount: 5, type: 'income', category: 'deposit' })
    await assert.rejects(migrate(preview.fingerprint), { status: 409 })
    assert.equal(await Transactions.countDocuments(), 1); assert.equal(await Migrations.countDocuments(), 0)
    assert.equal((await Orders.findById(orderIds[0]).lean()).transactions.length, 2)
  })
  await check('failed source update rolls back actual migrated transaction insertion', async () => {
    const original = await seedLegacy(), preview = await previewLegacy()
    const wrapped = Object.create(Orders)
    wrapped.updateOne = async () => { throw new Error('injected legacy clear failure') }
    await assert.rejects(migrate(preview.fingerprint, await loadLegacy({ getPartyOrderModel: async () => wrapped })), /injected/)
    assert.equal(await Transactions.countDocuments(), 0); assert.equal(await Migrations.countDocuments(), 0)
    assert.deepEqual(ledgerValues((await Orders.findById(orderIds[0]).lean()).transactions), ledgerValues(original.transactions))
  })
  await check('stale order PATCH guard cannot resurrect migrated source entries', async () => {
    const original = await seedLegacy(), preview = await previewLegacy()
    await migrate(preview.fingerprint)
    const result = await Orders.updateOne({ _id: original._id, tenantId, ...guard(original) }, { $set: { transactions: original.transactions } })
    assert.equal(result.matchedCount, 0)
    assert.equal((await Orders.findById(orderIds[0]).lean()).transactions.length, 0)
  })
  await check('group payment after migration retains imported income and adds only new allocations', async () => {
    await seedLegacy(); const preview = await previewLegacy()
    await assert.rejects(save(body()), { status: 409 })
    await migrate(preview.fingerprint); await save(body())
    assert.equal(await Transactions.countDocuments(), 4); assert.equal(await Payments.countDocuments(), 1)
    const rows = await Transactions.find({ tenantId }).lean()
    assert.equal(rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 12156)
    assert.equal(rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 45)
  })
  const constants = await compile('helpers/partyOrderTransactions.js', {}, '{PARTY_ORDER_PAYMENT_METHODS,PARTY_ORDER_TRANSACTION_CATEGORIES,PARTY_ORDER_TRANSACTION_TYPES}')
  const transactionCore = await compile('server/partyTransactionsCore.js', constants, '{normalizePartyTransactionPayload,serializePartyTransaction}')
  const partyError = (status, code, message) => Response.json({ error: { code, message } }, { status })
  const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))
  const transactionValidators = await compile('server/partyTransactions.js', { ...deps, ...transactionCore, partyError, isValidObjectId }, '{validatePartyPayoutTransactionStaff,validatePartyTransactionOrder}')
  const loadTransactionRoute = (overrides = {}) => compile('app/api/party/transactions/route.js', {
    ...deps, ...transactionCore, ...transactionValidators, partyError, isValidObjectId,
    NextResponse: { json: (data, options) => Response.json(data, options) },
    getPartyRequestContext: async () => ({ context: { tenantId, role: 'owner' } }),
    parseJsonBody: async (req) => req.json(),
    recordPartyOrderAudit: async () => {}, syncPartyOrderCalendarAfterCrud: async () => {},
    ...overrides,
  }, '{POST}')
  const postTransaction = (route) => route.POST(new Request('http://localhost/api/party/transactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: orderIds[0], amount: 50, type: 'income', category: 'client_payment', date: '2026-09-17', paymentMethod: 'cash' }) }))
  await check('normal transaction POST before migration refuses hiding embedded history', async () => {
    await seedLegacy()
    const response = await postTransaction(await loadTransactionRoute())
    assert.equal(response.status, 409); assert.equal(await Transactions.countDocuments(), 0)
    await migrate((await previewLegacy()).fingerprint)
    assert.equal(await Transactions.countDocuments(), 2)
  })
  await check('normal POST waits for in-progress migration and appends exactly one new payment', async () => {
    await seedLegacy(); const preview = await previewLegacy()
    let arrived, release, entered
    const paused = new Promise((resolve) => { arrived = resolve }), resume = new Promise((resolve) => { release = resolve })
    const routeEntered = new Promise((resolve) => { entered = resolve })
    const wrapped = Object.create(Transactions)
    wrapped.insertMany = async (...args) => { const rows = await Transactions.insertMany(...args); arrived(); await resume; return rows }
    const pendingMigration = migrate(preview.fingerprint, await loadLegacy({ getPartyTransactionModel: async () => wrapped }))
    await paused
    const route = await loadTransactionRoute({ withPartyFinancialTransaction: (...args) => { entered(); return transaction(...args) } })
    const pendingPost = postTransaction(route)
    await routeEntered; release()
    const [migration, response] = await Promise.all([pendingMigration, pendingPost])
    assert.equal(migration.status, 'migrated'); assert.equal(response.status, 201)
    assert.equal(await Transactions.countDocuments(), 3); assert.equal(await Migrations.countDocuments(), 1)
    assert.equal((await Orders.findById(orderIds[0]).lean()).transactions.length, 0)
  })
  await check('relocation PATCH blocks legacy target, then preserves exact amount and invalidates both order guards after migration', async () => {
    await seedLegacy()
    const sourceTransaction = await Transactions.create({ tenantId, orderId: orderIds[1], amount: 0.45, type: 'income', category: 'client_payment', date: new Date('2025-01-02T03:04:05Z'), paymentMethod: 'cash', comment: 'Relocate exact cents' })
    const route = await compile('app/api/party/transactions/[id]/route.js', {
      ...deps, ...transactionCore, ...transactionValidators, partyError, isValidObjectId,
      NextResponse: { json: (data, options) => Response.json(data, options) },
      getPartyRequestContext: async () => ({ context: { tenantId, role: 'owner' } }),
      parseJsonBody: async (req) => req.json(),
      recordPartyOrderAudit: async () => {}, syncPartyOrderCalendarAfterCrud: async () => {},
    }, '{PATCH}')
    const patch = () => route.PATCH(new Request('http://localhost/api/party/transactions/id', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: orderIds[0] }) }), { params: Promise.resolve({ id: String(sourceTransaction._id) }) })
    const blocked = await patch()
    assert.equal(blocked.status, 409)
    assert.equal((await blocked.json()).error.code, 'partycrm_legacy_ledger_migration_required')
    assert.equal(String((await Transactions.findById(sourceTransaction._id).lean()).orderId), orderIds[1])
    assert.equal(await Transactions.countDocuments(), 1)
    await migrate((await previewLegacy()).fingerprint)
    const source = await Orders.findById(orderIds[1]).lean(), target = await Orders.findById(orderIds[0]).lean()
    const allowed = await patch()
    assert.equal(allowed.status, 200)
    const moved = await Transactions.findById(sourceTransaction._id).lean()
    assert.equal(String(moved.orderId), orderIds[0]); assert.equal(moved.amount, 0.45)
    assert.equal(new Date(moved.date).toISOString(), '2025-01-02T03:04:05.000Z')
    assert.equal(await Transactions.countDocuments(), 3)
    for (const original of [source, target]) {
      assert.equal((await Orders.updateOne({ _id: original._id, tenantId, ...guard(original) }, { $set: { status: 'closed' } })).matchedCount, 0)
    }
  })
  console.log(`RESULT ${passed} checks passed against isolated MongoDB replica set; logs: ${directory}`)
} finally {
  await connection?.close().catch(() => {})
  if (bootstrap && bootstrap !== connection) await bootstrap.close().catch(() => {})
  if (child.exitCode === null && !startError) {
    child.kill()
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Could not stop isolated mongod PID ${child.pid}`)), 5000)
      child.once('exit', () => { clearTimeout(timeout); resolve() })
    })
  }
  console.log(`Isolated mongod stopped; data retained for inspection: ${directory}`)
}
