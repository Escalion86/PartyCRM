import crypto from 'node:crypto'
import { getPartyOrderModel, getPartyStaffModel } from './partyModels'
import {
  getPartyFinancialLockModel,
  getPartyFinancialOperationModel,
  getPartyPayrollStatementModel,
  getPartyFinancialSettlementModel,
} from './partyFinancialModels'
import {
  calculateSettlementTotals,
  financialError,
  financialId,
  getFinancialPeriodForEvent,
  isFinancialId,
  normalizeFinancialOperation,
  normalizeSettlementAmounts,
} from '@helpers/partyFinancialSettlements'

export const isFinancialManager = (context) =>
  ['owner', 'admin'].includes(context?.role)
export const getCompanyFinancialTimeZone = (company) =>
  company?.settings?.timeZone || company?.timeZone || 'Asia/Krasnoyarsk'

export const withPartyFinancialTransaction = async (tenantId, callback) => {
  if (!isFinancialId(tenantId)) throw financialError('Не выбрана компания')
  const Lock = await getPartyFinancialLockModel()
  await Lock.init()
  try {
    await Lock.updateOne(
      { tenantId },
      { $setOnInsert: { tenantId, revision: 0 } },
      { upsert: true }
    )
  } catch (error) {
    if (error.code !== 11000) throw error
  }
  const session = await Lock.db.startSession()
  try {
    return await session.withTransaction(async () => {
      await Lock.updateOne({ tenantId }, { $inc: { revision: 1 } }, { session })
      return callback(session)
    })
  } finally {
    await session.endSession()
  }
}

export const assertSettlementAccess = (
  settlement,
  context,
  { managementOnly = false } = {}
) => {
  if (
    !settlement ||
    financialId(settlement.tenantId) !== financialId(context.tenantId)
  )
    throw financialError('Сверка не найдена', 404)
  if (
    (managementOnly ||
      financialId(settlement.staffId) !== financialId(context.staff?._id)) &&
    !isFinancialManager(context)
  )
    throw financialError('Недостаточно прав для финансовой сверки', 403)
}

export const enrichSettlements = async (
  settlements,
  { session = null } = {}
) => {
  const Operations = await getPartyFinancialOperationModel()
  const operations = settlements.length
    ? await Operations.find({
        tenantId: settlements[0].tenantId,
        settlementId: { $in: settlements.map((item) => item._id) },
      })
        .sort({ createdAt: 1 })
        .session(session)
        .select('-payloadHash -idempotencyKey')
        .lean()
    : []
  const grouped = new Map()
  for (const operation of operations) {
    const id = financialId(operation.settlementId)
    grouped.set(id, [...(grouped.get(id) || []), operation])
  }
  return settlements.map((settlement) => ({
    ...settlement,
    operations: grouped.get(financialId(settlement)) || [],
    totals: calculateSettlementTotals(
      settlement,
      grouped.get(financialId(settlement)) || []
    ),
  }))
}

export const createPartyFinancialSettlement = async ({
  context,
  body,
  imported = null,
}) => {
  const orderId = financialId(body.orderId)
  const staffId = financialId(body.staffId || context.staff?._id)
  if (!isFinancialId(orderId) || !isFinancialId(staffId))
    throw financialError('Некорректный заказ или сотрудник')
  if (
    !isFinancialManager(context) &&
    staffId !== financialId(context.staff?._id)
  )
    throw financialError('Можно создать только свою сверку', 403)
  const [Orders, Staff, Settlements] = await Promise.all([
    getPartyOrderModel(),
    getPartyStaffModel(),
    getPartyFinancialSettlementModel(),
  ])
  await Settlements.init()
  const order = await Orders.findOne({
    tenantId: context.tenantId,
    _id: orderId,
  }).lean()
  const staff = await Staff.findOne({
    tenantId: context.tenantId,
    _id: staffId,
    status: { $ne: 'archived' },
  }).lean()
  if (!order || !staff)
    throw financialError('Заказ или сотрудник не найден', 404)
  if (
    !(order.assignedStaff || []).some(
      (item) => financialId(item.staffId) === staffId
    )
  )
    throw financialError('Сотрудник не назначен на этот праздник', 409)
  const defaultAccrual = Math.round(
    Number(
      (order.assignedStaff || []).find(
        (item) => financialId(item.staffId) === staffId
      )?.payoutAmount || 0
    ) * 100
  )
  const amounts = normalizeSettlementAmounts({
    ...body,
    accrualKopecks: body.accrualKopecks ?? defaultAccrual,
  })
  const period = getFinancialPeriodForEvent(
    order.eventDate,
    getCompanyFinancialTimeZone(context.company)
  )
  const Statements = await getPartyPayrollStatementModel()
  if (
    await Statements.exists({
      tenantId: context.tenantId,
      periodKey: period.periodKey,
      status: { $in: ['approved', 'paid'] },
    })
  )
    throw financialError(
      'Ведомость этого периода уже утверждена; новый расчёт добавить нельзя',
      409
    )
  try {
    return await Settlements.create({
      ...amounts,
      ...(imported || {}),
      tenantId: context.tenantId,
      orderId,
      staffId,
      eventDate: order.eventDate,
      periodKey: period.periodKey,
    })
  } catch (error) {
    if (error.code === 11000)
      throw financialError(
        'Сверка этого сотрудника по празднику уже существует',
        409
      )
    throw error
  }
}

export const performPartyFinancialOperation = async ({
  context,
  settlementId,
  body,
}) => {
  if (!isFinancialId(settlementId)) throw financialError('Некорректная сверка')
  const normalized = normalizeFinancialOperation(body)
  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({ ...normalized, actor: financialId(context.staff?._id) })
    )
    .digest('hex')
  const Operations = await getPartyFinancialOperationModel()
  await Operations.init()
  return withPartyFinancialTransaction(context.tenantId, async (session) => {
    const repeated = await Operations.findOne({
      tenantId: context.tenantId,
      idempotencyKey: normalized.idempotencyKey,
    })
      .session(session)
      .lean()
    if (repeated) {
      if (repeated.payloadHash !== hash)
        throw financialError(
          'Идентификатор уже использован для другой денежной операции',
          409
        )
      return {
        operation: {
          ...repeated,
          payloadHash: undefined,
          idempotencyKey: undefined,
        },
        repeated: true,
      }
    }
    const Settlements = await getPartyFinancialSettlementModel()
    const settlement = await Settlements.findOne({
      tenantId: context.tenantId,
      _id: settlementId,
    })
      .session(session)
      .lean()
    assertSettlementAccess(settlement, context, {
      managementOnly: normalized.type !== 'received_on_site',
    })
    if (normalized.type === 'payment' && settlement.status !== 'approved')
      throw financialError(
        'Выплата разрешена только после утверждения сверки',
        409
      )
    if (
      normalized.type === 'received_on_site' &&
      !['draft', 'revision'].includes(settlement.status)
    )
      throw financialError(
        'Получение денег на празднике фиксируется до отправки сверки',
        409
      )
    const previous = await Operations.find({
      tenantId: context.tenantId,
      settlementId,
    })
      .session(session)
      .lean()
    const totals = calculateSettlementTotals(settlement, previous)
    if (
      normalized.type === 'payment' &&
      normalized.amountKopecks > Math.max(0, totals.balance)
    )
      throw financialError(
        `Остаток к выплате ${Math.max(0, totals.balance)} коп.; повторная выплата исключена`,
        409
      )
    if (
      normalized.type === 'received_on_site' &&
      normalized.amountKopecks > Math.max(0, totals.payable)
    )
      throw financialError(
        `Доступно к получению на месте ${Math.max(0, totals.payable)} коп.`,
        409
      )
    const [record] = await Operations.create(
      [
        {
          ...normalized,
          tenantId: context.tenantId,
          settlementId,
          orderId: settlement.orderId,
          staffId: settlement.staffId,
          payloadHash: hash,
          createdByStaffId: context.staff._id,
        },
      ],
      { session }
    )
    return {
      operation: {
        ...record.toObject(),
        payloadHash: undefined,
        idempotencyKey: undefined,
      },
      repeated: false,
      totals: calculateSettlementTotals(settlement, [
        ...previous,
        record.toObject(),
      ]),
    }
  })
}
