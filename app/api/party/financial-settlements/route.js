import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import {
  createPartyFinancialSettlement,
  enrichSettlements,
  isFinancialManager,
} from '@server/partyFinancialSettlements'
import { getPartyFinancialSettlementModel } from '@server/partyFinancialModels'
import { isFinancialId } from '@helpers/partyFinancialSettlements'

export const dynamic = 'force-dynamic'
export const GET = financialRoute(async (req, context) => {
  const params = req.nextUrl.searchParams
  const filter = { tenantId: context.tenantId }
  for (const name of ['orderId', 'staffId'])
    if (params.get(name) && isFinancialId(params.get(name)))
      filter[name] = params.get(name)
  if (params.get('periodKey'))
    filter.periodKey = String(params.get('periodKey')).slice(0, 10)
  if (
    params.get('status') &&
    ['draft', 'submitted', 'approved', 'revision'].includes(
      params.get('status')
    )
  )
    filter.status = params.get('status')
  if (!isFinancialManager(context)) filter.staffId = context.staff._id
  const Settlements = await getPartyFinancialSettlementModel()
  return financialResponse(
    await enrichSettlements(
      await Settlements.find(filter)
        .sort({ eventDate: -1, createdAt: -1 })
        .limit(1000)
        .lean()
    )
  )
})
export const POST = financialRoute(async (req, context) =>
  financialResponse(
    await createPartyFinancialSettlement({
      context,
      body: await parseJsonBody(req),
    }),
    201
  )
)
