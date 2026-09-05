import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import { getPartyPayrollStatementModel } from '@server/partyFinancialModels'
import { generatePartyPayrollStatement } from '@server/partyPayrollStatements'

export const dynamic = 'force-dynamic'
export const GET = financialRoute(
  async (req, context) => {
    const Statements = await getPartyPayrollStatementModel()
    const periodKey = req.nextUrl.searchParams.get('periodKey')
    return financialResponse(
      await Statements.find({
        tenantId: context.tenantId,
        ...(periodKey ? { periodKey } : {}),
      })
        .sort({ periodKey: -1 })
        .limit(100)
        .lean()
    )
  },
  { managementOnly: true }
)
export const POST = financialRoute(
  async (req, context) =>
    financialResponse(
      await generatePartyPayrollStatement({
        context,
        periodKey: (await parseJsonBody(req)).periodKey,
      }),
      201
    ),
  { managementOnly: true }
)
