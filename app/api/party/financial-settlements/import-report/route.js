import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import { getPartyReportReconciliationModel } from '@server/partyReportModels'
import { createPartyFinancialSettlement } from '@server/partyFinancialSettlements'
import { getPartyFinancialSettlementModel } from '@server/partyFinancialModels'
import {
  financialError,
  isFinancialId,
} from '@helpers/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

export const POST = financialRoute(
  async (req, context) => {
    const body = await parseJsonBody(req)
    const sourceId = String(body.sourceReportReconciliationId || '')
    if (!isFinancialId(sourceId))
      throw financialError('Некорректная сверка отчёта')
    const Reports = await getPartyReportReconciliationModel()
    const source = await Reports.findOne({
      tenantId: context.tenantId,
      _id: sourceId,
      status: 'accepted',
    }).lean()
    if (!source) throw financialError('Принятая сверка отчёта не найдена', 404)
    const accepted = source.values.filter(
      (value) =>
        value.valueType === 'money' &&
        value.hasValue &&
        value.status === 'accepted' &&
        Number.isSafeInteger(value.moneyMinor) &&
        value.moneyMinor >= 0
    )
    const known = ['payout_taken', 'transport_cost', 'other_expense']
    for (const key of known)
      if (accepted.filter((item) => item.key === key).length > 1)
        throw financialError(
          `В принятом отчёте повторяется денежное поле ${key}`,
          409
        )
    const value = (key) =>
      accepted.find((item) => item.key === key)?.moneyMinor || 0
    const Settlements = await getPartyFinancialSettlementModel()
    if (
      await Settlements.exists({
        tenantId: context.tenantId,
        sourceReportReconciliationId: sourceId,
      })
    )
      throw financialError('Эта сверка отчёта уже импортирована', 409)
    const settlement = await createPartyFinancialSettlement({
      context,
      body: {
        orderId: source.orderId,
        staffId: source.staffId,
        transportKopecks: value('transport_cost'),
        otherExpenseKopecks: value('other_expense'),
        comment: `Импорт из принятой сверки отчёта ${source.reportId}`,
      },
      imported: {
        sourceReportReconciliationId: sourceId,
        importedReceivedOnSiteKopecks: value('payout_taken'),
        status: 'approved',
        reviewedAt: new Date(),
        reviewedByStaffId: context.staff._id,
      },
    })
    await recordPartyOrderAudit({
      context,
      orderId: source.orderId,
      action: 'financial_settlement_imported',
      summary: 'Импортировал принятые финансовые значения отчёта',
      changes: [],
      metadata: {
        settlementId: settlement._id,
        sourceReportReconciliationId: sourceId,
      },
    })
    return financialResponse(settlement, 201)
  },
  { managementOnly: true }
)
