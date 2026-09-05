import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import { changePartyPayrollStatementStatus } from '@server/partyPayrollStatements'
import {
  financialError,
  isFinancialId,
} from '@helpers/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

export const PATCH = financialRoute(
  async (req, context, { params }) => {
    const { id } = await params
    if (!isFinancialId(id)) throw financialError('Некорректная ведомость')
    const body = await parseJsonBody(req)
    const statement = await changePartyPayrollStatementStatus({
      context,
      id,
      action: body.action,
    })
    for (const line of statement.lines)
      await recordPartyOrderAudit({
        context,
        orderId: line.orderId,
        action: `payroll_statement_${body.action}`,
        summary:
          body.action === 'mark_paid'
            ? 'Закрыл ведомость после фиксации выплат'
            : 'Утвердил строку ведомости',
        changes: [],
        metadata: { statementId: id, settlementId: line.settlementId },
      })
    return financialResponse(statement)
  },
  { managementOnly: true }
)
