import { assertPayrollSnapshotCurrent, assertPayrollSnapshotMembership } from '@helpers/partyPayrollSnapshot'
import {
  getPartyPayrollStatementModel,
  getPartyFinancialSettlementModel,
} from './partyFinancialModels'
import {
  enrichSettlements,
  getCompanyFinancialTimeZone,
  isFinancialManager,
  withPartyFinancialTransaction,
} from './partyFinancialSettlements'
import {
  financialError,
  getFinancialPeriodForEvent,
  zonedMidnight,
} from '@helpers/partyFinancialSettlements'

export const getPeriodFromKey = (key, timeZone) => {
  const match = /^(\d{4})-(\d{2})-(H1|H2)$/.exec(String(key || ''))
  if (!match)
    throw financialError('Период должен иметь вид ГГГГ-ММ-H1 или ГГГГ-ММ-H2')
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12)
    throw financialError('Некорректный месяц периода')
  return getFinancialPeriodForEvent(
    new Date(
      +zonedMidnight(year, month, match[3] === 'H1' ? 1 : 16, timeZone) +
        12 * 3600000
    ),
    timeZone
  )
}

export const generatePartyPayrollStatement = async ({ context, periodKey }) => {
  if (!isFinancialManager(context))
    throw financialError('Недостаточно прав для ведомости', 403)
  const period = getPeriodFromKey(
    periodKey,
    getCompanyFinancialTimeZone(context.company)
  )
  const [Settlements, Statements] = await Promise.all([
    getPartyFinancialSettlementModel(),
    getPartyPayrollStatementModel(),
  ])
  await Statements.init()
  return withPartyFinancialTransaction(context.tenantId, async (session) => {
    const existing = await Statements.findOne({
      tenantId: context.tenantId,
      periodKey: period.periodKey,
    }).session(session).lean()
    if (existing && existing.status !== 'draft')
      throw financialError('Утверждённую ведомость нельзя пересобирать', 409)
    const settlements = await enrichSettlements(
      await Settlements.find({
        tenantId: context.tenantId,
        periodKey: period.periodKey,
        status: 'approved',
      })
        .session(session)
        .sort({ eventDate: 1, orderId: 1, staffId: 1 })
        .lean(),
      { session }
    )
    const lines = settlements.map((item) => ({
      settlementId: item._id,
      orderId: item.orderId,
      staffId: item.staffId,
      eventDate: item.eventDate,
      accrualKopecks: item.accrualKopecks,
      deductionKopecks: item.deductionKopecks,
      transportKopecks: item.transportKopecks,
      otherExpenseKopecks: item.otherExpenseKopecks,
      importedReceivedOnSiteKopecks: item.importedReceivedOnSiteKopecks,
      totals: item.totals,
    }))
    const updated = await Statements.findOneAndUpdate(
      { tenantId: context.tenantId, periodKey: period.periodKey, status: 'draft' },
      {
        $set: {
          ...period,
          lines,
          generatedAt: new Date(),
          generatedByStaffId: context.staff._id,
        },
        $setOnInsert: { status: 'draft' },
      },
      { upsert: !existing, new: true, session, runValidators: true }
    ).lean()
    if (!updated) throw financialError('Ведомость изменилась. Обновите её перед повтором.', 409)
    return updated
  })
}

export const changePartyPayrollStatementStatus = async ({
  context,
  id,
  action,
}) => {
  if (!isFinancialManager(context))
    throw financialError('Недостаточно прав для ведомости', 403)
  return withPartyFinancialTransaction(context.tenantId, async (session) => {
    const Statements = await getPartyPayrollStatementModel()
    const statement = await Statements.findOne({
      tenantId: context.tenantId,
      _id: id,
    })
      .session(session)
      .lean()
    if (!statement) throw financialError('Ведомость не найдена', 404)
    const now = new Date()
    let patch
    if (action === 'approve' && statement.status === 'draft') {
      const Settlements = await getPartyFinancialSettlementModel()
      const unresolved = await Settlements.countDocuments({
        tenantId: context.tenantId,
        periodKey: statement.periodKey,
        status: { $ne: 'approved' },
      }).session(session)
      if (unresolved > 0)
        throw financialError(
          `Сначала завершите все расчёты периода: не утверждено ${unresolved}`,
          409
        )
      const current = await enrichSettlements(
        await Settlements.find({
          tenantId: context.tenantId,
          periodKey: statement.periodKey,
          status: 'approved',
        }).session(session).lean(),
        { session }
      )
      assertPayrollSnapshotCurrent(statement.lines, current)
      patch = {
        status: 'approved',
        approvedAt: now,
        approvedByStaffId: context.staff._id,
      }
    } else if (action === 'mark_paid' && statement.status === 'approved') {
      const Settlements = await getPartyFinancialSettlementModel()
      const current = await enrichSettlements(
        await Settlements.find({
          tenantId: context.tenantId,
          periodKey: statement.periodKey,
        })
          .session(session)
          .lean(),
        { session }
      )
      assertPayrollSnapshotMembership(statement.lines, current)
      if (current.some((item) => item.status !== 'approved' || item.totals.balance !== 0))
        throw financialError(
          'Сначала зафиксируйте отдельные выплаты: в ведомости остались долги или переплаты',
          409
        )
      patch = { status: 'paid', paidAt: now, paidByStaffId: context.staff._id }
    } else throw financialError('Недопустимый переход статуса ведомости', 409)
    const updated = await Statements.findOneAndUpdate(
      { tenantId: context.tenantId, _id: id, status: statement.status },
      { $set: patch },
      { new: true, session, runValidators: true }
    ).lean()
    if (!updated) throw financialError('Ведомость изменилась. Обновите её перед повтором.', 409)
    return updated
  })
}
