import { createHash } from 'node:crypto'
import { Types } from 'mongoose'
import { canPartyAccess } from '../helpers/partyRolePermissions'
import { isPartyTicketingEnabled } from '../helpers/partyTicketing'
import { ticketFailure, ticketId, ticketInteger, ticketDate, ticketText, ticketSaleTotals, normalizeTicketProgram, calculateTicketSalePrice, normalizeTicketContact, ticketRefundChange, allocateTicketValue, ticketVisitPeriod } from '../helpers/partyTicketsCore'
import { loadPartyTicketModels } from './partyTicketModels'
import { getPartyLocationModel, getPartyClientModel } from './partyModels'
import { withPartyVenueMutation, reservePartyVenue, assertPartyVenueEntryAllowed } from './partyVenueBookings'

const fullManager = (context) => context.role === 'owner' || context.role === 'admin' && !context.position
const locationScope = (context, includeTemplates = false) => {
  if (fullManager(context)) return {}
  const scope = context.position?.orderScope || {}
  const ids = context.role === 'location_owner' ? (context.staff.locationIds || []).map(String).filter((value) => !scope.locationIds?.length || scope.locationIds.map(String).includes(value)) : (scope.locationIds || []).map(String)
  if (context.role === 'location_owner' && !ids.length) return { _id: { $in: [] } }
  if (ids.length) return scope.includeUnlocated !== false && context.role !== 'location_owner' || includeTemplates ? { $or: [{ locationId: { $in: ids } }, { locationId: null }] } : { locationId: { $in: ids } }
  return scope.includeUnlocated === false && !includeTemplates ? { locationId: { $ne: null } } : {}
}
const scopeFilter = (context, extra = {}, templates = false) => ({ $and: [{ tenantId: context.tenantId }, locationScope(context, templates), extra] })
const locationEntityScope = (context) => Object.fromEntries(Object.entries(locationScope(context)).map(([key, value]) => [key === 'locationId' ? '_id' : key, key === '$or' ? value.map((clause) => ({ _id: clause.locationId })) : value]))
export const buildPartyTicketAccessFilter = (context, extra = {}) => canPartyAccess(context, { resource: 'tickets', action: 'read' }) ? scopeFilter(context, extra) : { tenantId: context.tenantId, _id: { $in: [] } }
const allowed = (context, name, action = 'edit') => canPartyAccess(context, { resource: `tickets${name ? `.${name}` : ''}`, action })
const requirePermission = (context, name) => { if (!allowed(context, name)) ticketFailure('Недостаточно прав для операции с билетами', 403, 'partycrm_ticketing_forbidden') }
const missing = () => ticketFailure('Запись не найдена или недоступна', 404, 'partycrm_ticketing_not_found')
const revisionOf = (payload, entity) => { if (ticketInteger(payload.expectedRevision) !== entity.revision) ticketFailure('Запись изменилась. Обновите данные и повторите действие', 409, 'partycrm_ticketing_stale') }
const cleanId = (value) => value ? String(value) : null
const plain = (value) => value?.toObject ? value.toObject() : value
const capsFor = (context) => ({ read: allowed(context, '', 'read'), manage: allowed(context, 'manage'), sell: allowed(context, 'sell'), payments: allowed(context, 'payments'), refund: allowed(context, 'refund'), checkin: allowed(context, 'checkin'), contacts: allowed(context, 'contacts', 'read'), contactsEdit: allowed(context, 'contacts'), finance: allowed(context, 'finance', 'read'), discounts: allowed(context, 'discounts') })
const canSeeSaleMoney = (context) => ['sell', 'payments', 'refund', 'finance'].some((key) => allowed(context, key, key === 'finance' ? 'read' : 'edit'))
const programDto = (record) => {
  const row = plain(record)
  return { _id: String(row._id), title: row.title, admission: row.admission, locationId: cleanId(row.locationId), source: row.source, externalProvider: row.externalProvider, externalProgramId: row.externalProgramId, unitPriceKopecks: row.unitPriceKopecks, currency: 'RUB', groupDiscount: row.groupDiscount, status: row.status, revision: row.revision, availabilityKnown: row.source === 'internal' }
}
const sessionDto = (record, program) => {
  const row = plain(record), known = program?.source === 'internal'
  return { _id: String(row._id), programId: String(row.programId), locationId: String(row.locationId), title: row.title, startsAt: row.startsAt, endsAt: row.endsAt, status: row.status, completedAt: row.completedAt || null, capacity: row.capacity, soldCount: known ? row.soldCount : null, availableCount: known ? Math.max(row.capacity - row.soldCount, 0) : null, availabilityKnown: known, revision: row.revision, operationalOrderId: null }
}
const saleDto = (context, record) => {
  const row = plain(record), totals = ticketSaleTotals(row)
  const output = { _id: String(row._id), programId: String(row.programId), sessionId: cleanId(row.sessionId), locationId: cleanId(row.locationId), programTitle: row.programTitle, admission: row.admission, quantity: row.quantity, refundedQuantity: row.refundedQuantity, admittedQuantity: row.admittedQuantity, availableAdmissionQuantity: totals.availableAdmissionQuantity, paymentComplete: totals.dueAmountKopecks === 0, status: row.status, validFrom: row.validFrom, validTo: row.validTo, createdAt: row.createdAt, revision: row.revision }
  if (allowed(context, 'contacts', 'read')) Object.assign(output, { clientId: cleanId(row.clientId), contact: row.contact })
  if (canSeeSaleMoney(context)) Object.assign(output, { unitPriceKopecks: row.unitPriceKopecks, groupDiscountKopecks: row.groupDiscountKopecks, discountKopecks: row.discountKopecks, totalAmountKopecks: row.totalAmountKopecks, paidAmountKopecks: row.paidAmountKopecks, refundedAmountKopecks: row.refundedAmountKopecks, ...totals })
  if (allowed(context, 'finance', 'read')) Object.assign(output, { fulfilledAt: row.fulfilledAt || null, earnedAmountKopecks: row.earnedAmountKopecks || 0, canceledValueKopecks: row.canceledValueKopecks || 0, admittedValueKopecks: row.admittedValueKopecks || 0 })
  return output
}
const requestHash = (action, payload) => {
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value
  return createHash('sha256').update(JSON.stringify({ action, payload: stable(payload) })).digest('hex')
}

// No network, calendars or provider calls may occur inside a retriable transaction.
export const withPartyTicketMutation = async ({ context, action, payload, requestKey, models, work }) => {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(String(requestKey || ''))) ticketFailure('Передайте ключ безопасного повтора операции')
  const { Locks, Operations } = models
  await Promise.all(Object.values(models).map((model) => model.init()))
  try { await Locks.updateOne({ tenantId: context.tenantId }, { $setOnInsert: { tenantId: context.tenantId, revision: 0 } }, { upsert: true }) }
  catch (error) { if (error.code !== 11000) throw error }
  const session = await Locks.db.startSession()
  try {
    return await session.withTransaction(async () => {
      await Locks.updateOne({ tenantId: context.tenantId }, { $inc: { revision: 1 } }, { session })
      const identity = { tenantId: context.tenantId, actorStaffId: context.staff._id, requestKey }, hash = requestHash(action, payload)
      const previous = await Operations.findOne(identity).session(session).lean()
      if (previous) {
        if (previous.requestHash !== hash) ticketFailure('Этот ключ повтора уже использован для другого действия', 409, 'partycrm_ticketing_idempotency_conflict')
        return { ...previous, replayed: true }
      }
      const operationId = new Types.ObjectId()
      const result = await work({ session, operationId })
      const [operation] = await Operations.create([{ _id: operationId, ...identity, requestHash: hash, action, ...result }], { session })
      return { ...plain(operation), replayed: false }
    })
  } finally { await session.endSession() }
}

export const createPartyTicketingService = (dependencies = {}) => {
  const loadModels = dependencies.loadModels || loadPartyTicketModels
  const getLocations = dependencies.getLocations || getPartyLocationModel
  const getClients = dependencies.getClients || getPartyClientModel
  const venueMutation = dependencies.withVenueMutation || withPartyVenueMutation
  const reserveVenue = dependencies.reserveVenue || reservePartyVenue
  const assertEntryAllowed = dependencies.assertEntryAllowed || assertPartyVenueEntryAllowed
  const mutateTransaction = dependencies.mutateTransaction || withPartyTicketMutation
  const now = dependencies.now || (() => new Date())
  const loadVisible = async (Model, context, id, session, templates = false) => {
    const query = Model.findOne(scopeFilter(context, { _id: ticketId(id) }, templates))
    const row = await (session ? query.session(session) : query).lean()
    if (!row) missing()
    return row
  }
  const location = async (context, id, session) => {
    const Locations = await getLocations(), row = await Locations.findOne({ $and: [{ _id: ticketId(id), tenantId: context.tenantId, status: 'active' }, locationEntityScope(context)] }).session(session).lean()
    if (!row) missing()
    return row
  }
  const ledger = async (models, context, sale, session, operationId, kind, input) => models.Ledger.create([{ tenantId: context.tenantId, saleId: sale._id, programId: sale.programId, sessionId: sale.sessionId, locationId: sale.locationId, operationId, kind, amountKopecks: input.amountKopecks || 0, quantity: input.quantity || 0, method: input.method || '', source: 'manual', comment: ticketText(input.comment || input.reason || '', 1000), recordedByStaffId: context.staff._id, occurredAt: now() }], { session })
  const saveSale = async (models, context, sale, changes, session) => {
    const updated = await models.Sales.findOneAndUpdate({ _id: sale._id, tenantId: context.tenantId, revision: sale.revision }, { $set: changes, $inc: { revision: 1 } }, { session, returnDocument: 'after', runValidators: true }).lean()
    if (!updated) ticketFailure('Продажа изменилась. Повторите действие', 409, 'partycrm_ticketing_stale')
    return updated
  }
  const paymentInput = (input) => {
    const amountKopecks = ticketInteger(input.amountKopecks, 1)
    if (!['cash', 'card'].includes(input.method)) ticketFailure('Укажите наличные или оплату картой')
    return { amountKopecks, method: input.method, comment: ticketText(input.comment || '', 1000) }
  }
  const updateSession = async (models, context, payload, session, operationId) => {
    const current = await loadVisible(models.Sessions, context, payload.sessionId, session)
    revisionOf(payload, current)
    const capacity = payload.capacity === undefined ? current.capacity : ticketInteger(payload.capacity, 1, 100000)
    if (capacity < current.soldCount) ticketFailure('Вместимость меньше числа забронированных билетов', 409)
    const startsAt = payload.startsAt === undefined ? current.startsAt : ticketDate(payload.startsAt, true), endsAt = payload.endsAt === undefined ? current.endsAt : ticketDate(payload.endsAt, true)
    if (+endsAt <= +startsAt || +endsAt - +startsAt > 7 * 86400000) ticketFailure('Проверьте время сеанса')
    if (current.soldCount && (+new Date(startsAt) !== +new Date(current.startsAt) || +new Date(endsAt) !== +new Date(current.endsAt))) ticketFailure('Сначала отмените или верните проданные билеты: перенос действующих покупок пока не подключён', 409)
    const status = payload.status || current.status
    if (!['scheduled', 'completed', 'canceled'].includes(status)) ticketFailure('Некорректный статус сеанса')
    if (current.status === 'completed' && (status !== 'completed' || +new Date(startsAt) !== +new Date(current.startsAt) || +new Date(endsAt) !== +new Date(current.endsAt))) ticketFailure('Проведённый сеанс нельзя перенести или открыть повторно', 409)
    if (status === 'completed' && +now() < +new Date(endsAt)) ticketFailure('Сеанс ещё не закончился', 409)
    if (status === 'canceled' && current.soldCount) ticketFailure('Сначала отмените или верните билеты сеанса', 409)
    if (current.status === 'canceled' && status !== 'canceled') ticketFailure('Отменённый сеанс нельзя восстановить', 409)
    const venue = await location(context, current.locationId, session)
    if (venue.capacity > 0 && capacity > venue.capacity) ticketFailure('Вместимость сеанса больше вместимости площадки')
    await venueMutation({ tenantId: context.tenantId, bookings: [current, { locationId: current.locationId, startsAt, endsAt }], session, work: async ({ session: venueSession }) => {
      await reserveVenue({ tenantId: context.tenantId, sourceType: 'ticket_session', sourceId: current._id, locationId: current.locationId, startsAt, endsAt, status, capacity, session: venueSession })
      const changed = await models.Sessions.updateOne({ _id: current._id, tenantId: context.tenantId, revision: current.revision }, { $set: { startsAt, endsAt, capacity, status, completedAt: status === 'completed' ? current.completedAt || now() : null }, $inc: { revision: 1 } }, { session: venueSession, runValidators: true })
      if (changed.matchedCount !== 1) ticketFailure('Сеанс изменился. Обновите данные', 409)
      if (status === 'completed') {
        const performedAt = endsAt
        const sales = await models.Sales.find({ tenantId: context.tenantId, sessionId: current._id, status: 'active', fulfilledAt: null }).session(venueSession).lean()
        for (const sale of sales) await models.Sales.updateOne({ _id: sale._id, tenantId: context.tenantId, fulfilledAt: null }, { $set: { fulfilledAt: performedAt, earnedAmountKopecks: ticketSaleTotals(sale).activeAmountKopecks }, $inc: { revision: 1 } }, { session: venueSession })
      }
    } })
    return { entity: 'session', entityId: current._id }
  }
  const execute = async (models, context, action, payload, session, operationId) => {
    const tenantId = context.tenantId
    if (action === 'program.create' || action === 'program.update') {
      requirePermission(context, 'manage')
      const previous = action === 'program.update' ? await loadVisible(models.Programs, context, payload.programId, session, true) : {}
      if (previous._id) revisionOf(payload, previous)
      const data = normalizeTicketProgram(payload, previous)
      if (data.locationId) await location(context, data.locationId, session)
      if (previous._id && ['source', 'admission', 'locationId', 'externalProvider', 'externalProgramId'].some((key) => String(data[key] || '') !== String(previous[key] || ''))) ticketFailure('Режим и площадка опубликованной программы неизменны; создайте новую программу')
      if (previous._id) {
        await models.Programs.updateOne({ _id: previous._id, tenantId, revision: previous.revision }, { $set: data, $inc: { revision: 1 } }, { session, runValidators: true })
        return { entity: 'program', entityId: previous._id }
      }
      const [created] = await models.Programs.create([{ ...data, tenantId, revision: 0 }], { session })
      return { entity: 'program', entityId: created._id }
    }
    if (action === 'session.update') { requirePermission(context, 'manage'); return updateSession(models, context, payload, session, operationId) }
    if (action === 'session.create') {
      requirePermission(context, 'manage')
      const program = await loadVisible(models.Programs, context, payload.programId, session, true)
      if (program.admission !== 'session' || program.status !== 'active') ticketFailure('Выберите действующую сеансовую программу')
      const locationId = ticketId(payload.locationId || program.locationId), venue = await location(context, locationId, session)
      if (program.locationId && String(program.locationId) !== locationId) ticketFailure('Сеанс должен использовать площадку программы')
      const startsAt = ticketDate(payload.startsAt, true), endsAt = ticketDate(payload.endsAt, true), capacity = ticketInteger(payload.capacity, 1, 100000)
      if (+endsAt <= +startsAt || +endsAt - +startsAt > 7 * 86400000) ticketFailure('Проверьте время сеанса')
      if (venue.capacity > 0 && capacity > venue.capacity) ticketFailure('Вместимость сеанса больше вместимости площадки')
      const sessionId = new Types.ObjectId()
      await venueMutation({ tenantId, bookings: [{ locationId, startsAt, endsAt }], session, work: async ({ session: venueSession }) => {
        await reserveVenue({ tenantId, sourceType: 'ticket_session', sourceId: sessionId, locationId, startsAt, endsAt, capacity, status: 'scheduled', session: venueSession })
        await models.Sessions.create([{ _id: sessionId, tenantId, programId: program._id, locationId, title: program.title, startsAt, endsAt, capacity, soldCount: 0, revision: 0 }], { session: venueSession })
      } })
      return { entity: 'session', entityId: sessionId }
    }
    if (action === 'sale.create') {
      requirePermission(context, 'sell')
      const program = await loadVisible(models.Programs, context, payload.programId, session, true)
      if (program.status !== 'active') ticketFailure('Программа недоступна для продажи', 409)
      if (program.source !== 'internal') ticketFailure('Продажа через внешнюю билетную систему пока не подключена; актуальный остаток неизвестен', 503, 'partycrm_ticketing_provider_unavailable')
      const sessionRow = program.admission === 'session' ? await loadVisible(models.Sessions, context, payload.sessionId, session) : null
      if (sessionRow && (String(sessionRow.programId) !== String(program._id) || sessionRow.status !== 'scheduled' || +new Date(sessionRow.endsAt) <= +now())) ticketFailure('Сеанс недоступен для продажи', 409)
      if (!sessionRow && payload.sessionId) ticketFailure('Для посещения без времени не указывайте сеанс')
      const locationId = sessionRow?.locationId || payload.locationId || program.locationId || null
      if (program.locationId && String(locationId) !== String(program.locationId)) ticketFailure('Проверьте площадку программы')
      if (locationId) await location(context, locationId, session)
      else if (Object.keys(locationScope(context)).length) ticketFailure('Укажите доступную площадку продажи', 403)
      const pricing = calculateTicketSalePrice({ program, quantity: payload.quantity, unitPriceKopecks: payload.unitPriceKopecks, discountKopecks: payload.discountKopecks, mayDiscount: allowed(context, 'discounts') })
      const hasContact = payload.clientId || Object.values(payload.contact || {}).some(Boolean)
      if (hasContact && !allowed(context, 'contacts')) ticketFailure('Нет права изменять контакт покупателя', 403)
      let contact = normalizeTicketContact(payload.contact), clientId = null
      if (payload.clientId) {
        clientId = ticketId(payload.clientId)
        const Clients = await getClients(), client = await Clients.findOne({ _id: clientId, tenantId, status: { $ne: 'archived' } }).session(session).lean()
        if (!client) missing()
        // A merge/archive must conflict with an in-flight link. The merge moves
        // ticket references after archiving its source, without rewriting history.
        const touched = await Clients.updateOne({ _id: clientId, tenantId, status: { $ne: 'archived' } }, { $inc: { __v: 1 } }, { session })
        if (touched.matchedCount !== 1) missing()
      } else if (contact.phone || contact.email) {
        const Clients = await getClients()
        const identity = contact.phone ? { phone: contact.phone } : { email: contact.email }
        const clients = await Clients.find({ tenantId, status: { $ne: 'archived' }, ...identity }).select('_id').limit(2).session(session).lean()
        if (clients.length > 1) ticketFailure('Найдено несколько подходящих карточек. Выберите покупателя явно или уточните контакты', 409, 'partycrm_ticketing_client_ambiguous')
        if (clients.length) {
          clientId = clients[0]._id
          const touched = await Clients.updateOne({ _id: clientId, tenantId, status: { $ne: 'archived' } }, { $inc: { __v: 1 } }, { session })
          if (touched.matchedCount !== 1) missing()
        } else {
          const [createdClient] = await Clients.create([{ tenantId, firstName: contact.name || 'Покупатель', phone: contact.phone, email: contact.email, status: 'active', leadSource: 'ticketing' }], { session })
          clientId = createdClient._id
        }
      }
      if (payload.visitDate && sessionRow) ticketFailure('Для сеанса срок действия задаётся его временем')
      if (payload.visitDate && (payload.validFrom || payload.validTo)) ticketFailure('Выберите дату посещения или явный срок действия')
      const visitPeriod = payload.visitDate ? ticketVisitPeriod(payload.visitDate, context.company?.settings?.timeZone) : null
      const validFrom = sessionRow ? sessionRow.startsAt : visitPeriod ? visitPeriod.validFrom : ticketDate(payload.validFrom), validTo = sessionRow ? sessionRow.endsAt : visitPeriod ? visitPeriod.validTo : ticketDate(payload.validTo)
      if (validFrom && validTo && +validTo <= +validFrom) ticketFailure('Проверьте срок действия билетов')
      const initialPayment = payload.initialPayment ? paymentInput(payload.initialPayment) : null
      if (initialPayment) { requirePermission(context, 'payments'); if (initialPayment.amountKopecks > pricing.totalAmountKopecks) ticketFailure('Оплата превышает стоимость билетов') }
      if (sessionRow) {
        const result = await models.Sessions.updateOne({ _id: sessionRow._id, tenantId, revision: sessionRow.revision, status: 'scheduled', soldCount: { $lte: sessionRow.capacity - pricing.quantity } }, { $inc: { soldCount: pricing.quantity, revision: 1 } }, { session })
        if (result.matchedCount !== 1) ticketFailure('Для продажи не хватает свободных билетов', 409, 'partycrm_ticketing_sold_out')
      }
      const [sale] = await models.Sales.create([{ tenantId, programId: program._id, sessionId: sessionRow?._id || null, locationId, clientId, programTitle: program.title, admission: program.admission, contact, ...pricing, validFrom, validTo, paidAmountKopecks: initialPayment?.amountKopecks || 0, refundedAmountKopecks: 0, refundedQuantity: 0, admittedQuantity: 0, canceledValueKopecks: 0, admittedValueKopecks: 0, status: 'active', revision: 0, createdByStaffId: context.staff._id }], { session })
      if (initialPayment) await ledger(models, context, sale, session, operationId, 'payment', initialPayment)
      return { entity: 'sale', entityId: sale._id }
    }
    const sale = await loadVisible(models.Sales, context, payload.saleId, session)
    if (action === 'payment.record') {
      requirePermission(context, 'payments')
      const input = paymentInput(payload)
      if (sale.status !== 'active' || input.amountKopecks > ticketSaleTotals(sale).dueAmountKopecks) ticketFailure('Сумма превышает остаток оплаты или продажа отменена', 409)
      await saveSale(models, context, sale, { paidAmountKopecks: sale.paidAmountKopecks + input.amountKopecks }, session)
      await ledger(models, context, sale, session, operationId, 'payment', input)
    } else if (action === 'refund.record' || action === 'sale.cancel') {
      requirePermission(context, action === 'sale.cancel' ? 'sell' : 'refund')
      if (action === 'sale.cancel' && (sale.paidAmountKopecks || sale.admittedQuantity)) ticketFailure('Оплаченную или использованную покупку отменяйте через возврат', 409)
      const reason = ticketText(payload.reason || '', 1000)
      if (!reason) ticketFailure('Укажите причину отмены или возврата')
      const change = ticketRefundChange(sale, action === 'sale.cancel' ? { quantity: sale.quantity - sale.refundedQuantity, amountKopecks: 0 } : payload)
      if (change.amountKopecks && !['cash', 'card'].includes(payload.method)) ticketFailure('Укажите способ фактического возврата: наличные или карта')
      await saveSale(models, context, sale, { refundedQuantity: change.refundedQuantity, refundedAmountKopecks: change.refundedAmountKopecks, canceledValueKopecks: change.canceledValueKopecks, status: change.status }, session)
      if (sale.sessionId && change.quantity) {
        const changed = await models.Sessions.updateOne({ _id: sale.sessionId, tenantId, soldCount: { $gte: change.quantity } }, { $inc: { soldCount: -change.quantity, revision: 1 } }, { session })
        if (changed.matchedCount !== 1) ticketFailure('Остаток сеанса изменился. Обратитесь к администратору', 409)
      }
      await ledger(models, context, sale, session, operationId, 'refund', { ...change, reason, method: payload.method && ['cash', 'card'].includes(payload.method) ? payload.method : '' })
    } else if (action === 'admission.record') {
      requirePermission(context, 'checkin')
      const quantity = ticketInteger(payload.quantity, 1, ticketSaleTotals(sale).availableAdmissionQuantity)
      if (sale.status !== 'active' || ticketSaleTotals(sale).dueAmountKopecks > 0) ticketFailure('Для прохода нужны действующие оплаченные билеты', 409)
      const at = now()
      if (sale.validFrom && +at < +new Date(sale.validFrom) || sale.validTo && +at >= +new Date(sale.validTo)) ticketFailure('Билеты ещё не действуют или срок посещения истёк', 409)
      if (sale.sessionId) { const current = await loadVisible(models.Sessions, context, sale.sessionId, session); if (current.status === 'canceled') ticketFailure('Сеанс отменён', 409) }
      const allocated = allocateTicketValue(sale, quantity)
      const earned = sale.admission === 'open' ? allocated : 0
      const admit = async (entrySession) => {
        await saveSale(models, context, sale, { admittedQuantity: sale.admittedQuantity + quantity, admittedValueKopecks: (sale.admittedValueKopecks || 0) + allocated }, entrySession)
        await ledger(models, context, sale, entrySession, operationId, 'admission', { quantity, amountKopecks: earned })
      }
      if (sale.locationId) await venueMutation({ tenantId, locationIds: [sale.locationId], at, session, work: async ({ session: entrySession }) => {
        await assertEntryAllowed({ tenantId, locationId: sale.locationId, at, session: entrySession, excludeTicketSessionId: sale.sessionId || undefined })
        await admit(entrySession)
      } })
      else await admit(session)
    } else ticketFailure('Неизвестное действие билетного модуля')
    return { entity: 'sale', entityId: sale._id }
  }
  const readEntity = async (models, context, entity, id) => {
    if (entity === 'program') return programDto(await loadVisible(models.Programs, context, id, null, true))
    if (entity === 'session') { const row = await loadVisible(models.Sessions, context, id); const program = await loadVisible(models.Programs, context, row.programId, null, true); return sessionDto(row, program) }
    const sale = await loadVisible(models.Sales, context, id), output = saleDto(context, sale)
    if (allowed(context, 'finance', 'read')) output.ledger = await models.Ledger.find({ tenantId: context.tenantId, saleId: sale._id }).sort({ _id: -1 }).select('-__v').lean()
    return output
  }
  return {
    async mutate(context, body) {
      if (!allowed(context, '', 'read')) ticketFailure('Нет доступа к билетному модулю', 403)
      if (!body || typeof body !== 'object' || Array.isArray(body)) ticketFailure('Проверьте билетную операцию')
      const action = typeof body.action === 'string' ? body.action : '', payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {}
      const maintenance = ['refund.record', 'sale.cancel', 'admission.record'].includes(action) || action === 'session.update' && payload.status === 'canceled' && Object.keys(payload).every((key) => ['sessionId', 'expectedRevision', 'status'].includes(key))
      if (!isPartyTicketingEnabled(context.company) && !maintenance) ticketFailure('Билетный модуль выключен; доступны история и обслуживание действующих билетов', 403, 'partycrm_ticketing_disabled')
      const permissions = { 'program.create': 'manage', 'program.update': 'manage', 'session.create': 'manage', 'session.update': 'manage', 'sale.create': 'sell', 'sale.cancel': 'sell', 'payment.record': 'payments', 'refund.record': 'refund', 'admission.record': 'checkin' }
      if (!Object.hasOwn(permissions, action)) ticketFailure('Неизвестное действие билетного модуля')
      requirePermission(context, permissions[action])
      const models = await loadModels()
      const operation = await mutateTransaction({ context, action, payload, requestKey: body.requestKey, models, work: ({ session, operationId }) => execute(models, context, action, payload, session, operationId) })
      return { data: await readEntity(models, context, operation.entity, operation.entityId), operation: { id: String(operation._id), replayed: operation.replayed } }
    },
    async read(context, params) {
      if (!allowed(context, '', 'read')) ticketFailure('Нет доступа к билетному модулю', 403)
      const models = await loadModels(), requestedSection = params.get('section') || 'catalog', section = requestedSection === 'clientSales' ? 'sales' : requestedSection
      if (requestedSection === 'clientSales' && (!params.get('clientId') || !allowed(context, 'contacts', 'read'))) ticketFailure('Нет права просматривать покупки клиента', 403)
      if (section === 'sale' || section === 'session') return { data: await readEntity(models, context, section, ticketId(params.get('id'))) }
      if (!['catalog', 'programs', 'sessions', 'sales'].includes(section)) ticketFailure('Неизвестный раздел билетного модуля')
      const cursor = params.get('cursor') ? ticketId(params.get('cursor')) : '', extra = { ...(cursor ? { _id: { $lt: cursor } } : {}), ...(params.get('programId') ? { programId: ticketId(params.get('programId')) } : {}), ...(params.get('locationId') ? { locationId: ticketId(params.get('locationId')) } : {}) }
      if (params.get('sessionId')) { if (section !== 'sales') ticketFailure('Фильтр сеанса доступен для продаж'); extra.sessionId = ticketId(params.get('sessionId')) }
      if (params.get('clientId')) { if (section !== 'sales' || !allowed(context, 'contacts', 'read')) ticketFailure('Нет права использовать фильтр покупателя', 403); extra.clientId = ticketId(params.get('clientId')) }
      if (params.has('from') || params.has('to')) {
        if (section !== 'sessions') ticketFailure('Диапазон дат доступен для сеансов')
        const from = ticketDate(params.get('from'), true), to = ticketDate(params.get('to'), true)
        if (+to <= +from || +to - +from > 93 * 86400000) ticketFailure('Диапазон сеансов должен быть не больше 93 дней')
        Object.assign(extra, { startsAt: { $lt: to }, endsAt: { $gte: from } })
      }
      if (section === 'catalog') {
        const programRows = await models.Programs.find(scopeFilter(context, {}, true)).sort({ _id: -1 }).limit(501).lean()
        const sessionRows = await models.Sessions.find(scopeFilter(context, { status: 'scheduled', endsAt: { $gte: now() } })).sort({ _id: -1 }).limit(41).lean()
        const Locations = await getLocations(), visibleLocations = await Locations.find({ $and: [{ tenantId: context.tenantId, status: { $ne: 'archived' } }, locationEntityScope(context)] }).select('_id title capacity status usageMode').lean()
        const byProgram = new Map(programRows.map((row) => [String(row._id), row]))
        const missingPrograms = sessionRows.filter((row) => !byProgram.has(String(row.programId))).map((row) => row.programId)
        if (missingPrograms.length) for (const row of await models.Programs.find({ tenantId: context.tenantId, _id: { $in: missingPrograms } }).lean()) byProgram.set(String(row._id), row)
        return { data: { enabled: isPartyTicketingEnabled(context.company), capabilities: capsFor(context), maintenanceActions: ['refund.record', 'sale.cancel', 'admission.record', 'session.cancel'], programs: programRows.slice(0, 500).map(programDto), programsHasMore: programRows.length > 500, locations: visibleLocations, sessions: sessionRows.slice(0, 40).map((row) => sessionDto(row, byProgram.get(String(row.programId)))), nextCursor: sessionRows.length > 40 ? String(sessionRows[39]._id) : null, limitations: { externalSalesConnected: false, operationalOrdersLinked: false, openVisitOccupancyTracked: false, paymentsSource: 'manual', receiptIssued: false } } }
      }
      const Model = section === 'programs' ? models.Programs : section === 'sessions' ? models.Sessions : models.Sales
      const rows = await Model.find(scopeFilter(context, extra, section === 'programs')).sort({ _id: -1 }).limit(41).lean()
      const values = rows.slice(0, 40), hasMore = rows.length > 40
      let data
      if (section === 'programs') data = values.map(programDto)
      else if (section === 'sales') data = values.map((row) => saleDto(context, row))
      else { const programs = await models.Programs.find({ tenantId: context.tenantId, _id: { $in: values.map((row) => row.programId) } }).lean(), byId = new Map(programs.map((row) => [String(row._id), row])); data = values.map((row) => sessionDto(row, byId.get(String(row.programId)))) }
      return { data, meta: { nextCursor: hasMore ? String(values.at(-1)._id) : null, hasMore } }
    },
  }
}
