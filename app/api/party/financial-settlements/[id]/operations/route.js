import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import { performPartyFinancialOperation } from '@server/partyFinancialSettlements'
import {
  isFinancialId,
  financialError,
} from '@helpers/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

export const POST = financialRoute(async (req, context, { params }) => {
  const { id } = await params
  if (!isFinancialId(id)) throw financialError('Некорректная сверка')
  const result = await performPartyFinancialOperation({
    context,
    settlementId: id,
    body: await parseJsonBody(req),
  })
  if (!result.repeated)
    await recordPartyOrderAudit({
      context,
      orderId: result.operation.orderId,
      action: `financial_${result.operation.type}`,
      summary:
        result.operation.type === 'payment'
          ? 'Зафиксировал выплату сотруднику'
          : result.operation.type === 'received_on_site'
            ? 'Зафиксировал получение оплаты на празднике'
            : 'Добавил финансовую корректировку',
      changes: [],
      metadata: {
        settlementId: id,
        operationId: result.operation._id,
        amountKopecks: result.operation.amountKopecks,
      },
    })
  return financialResponse(result)
})
